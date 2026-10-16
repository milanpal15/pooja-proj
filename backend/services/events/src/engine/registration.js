/**
 * Joining and leaving (docs/EVENTS.md section 10). Free events only: a `coins` event answers 409 paid_not_available until phase 5.
 *
 * Capacity is atomic. `Seats.taken` is raised with ONE conditional update (`taken < capacity`), so two devotees can never both take
 * the last seat; only after a seat is held is the Registration written, and a seat taken for a join that then turns out to be a
 * repeat (the same devotee twice in parallel) is given straight back. Leaving flips the registration joined -> cancelled with a
 * conditional update and returns the seat only if THIS call flipped it.
 */
import crypto from 'node:crypto';

import { HttpError } from '../lib/http-error.js';
import { Registration, Seats } from '../models/index.js';
import { deriveStatus, registrationWindowOpen } from '../events/status.js';
import { hasRegistration } from '../events/present.js';

export const PASS_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const isDup = (e) => e?.code === 11000;

/** `<PREFIX>-<4 chars>`: PREFIX is the first 3 letters of the slug, uppercased (padded with X when the slug has fewer). */
export function makePassCode(slug) {
  const prefix = (String(slug).replace(/[^a-z]/gi, '').toUpperCase() + 'XXX').slice(0, 3);
  const bytes = crypto.randomBytes(4);
  return `${prefix}-${[...bytes].map((b) => PASS_ALPHABET[b % PASS_ALPHABET.length]).join('')}`;
}

/** Validates `answers` against the event's custom fields; returns the cleaned object. Unknown keys are dropped. */
export function validateAnswers(fields, answers) {
  if (answers !== undefined && answers !== null && (typeof answers !== 'object' || Array.isArray(answers))) throw new HttpError(400, 'bad_answer', 'answers must be an object.');
  const given = answers ?? {};
  const out = {};
  for (const f of fields ?? []) {
    const raw = given[f.key];
    const blank = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (blank) {
      if (f.required) throw new HttpError(400, 'missing_field', `${f.label || f.key} is required.`, { field: f.key });
      continue;
    }
    if (f.type === 'number') {
      const n = typeof raw === 'string' ? Number(raw) : raw;
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new HttpError(400, 'bad_answer', `${f.label || f.key} must be a number.`, { field: f.key });
      out[f.key] = n;
    } else if (f.type === 'choice') {
      if (typeof raw !== 'string' || !(f.options ?? []).includes(raw.trim())) throw new HttpError(400, 'bad_answer', `${f.label || f.key}: choose one of the options.`, { field: f.key });
      out[f.key] = raw.trim();
    } else {
      if (typeof raw !== 'string') throw new HttpError(400, 'bad_answer', `${f.label || f.key} must be text.`, { field: f.key });
      if (raw.trim().length > 500) throw new HttpError(400, 'bad_answer', `${f.label || f.key} is too long.`, { field: f.key });
      out[f.key] = raw.trim();
    }
  }
  return out;
}

const view = (reg, event) => ({
  status: reg.status,
  passCode: event.registration?.pass && reg.passCode ? reg.passCode : null,
  joinedAt: reg.joinedAt ? new Date(reg.joinedAt).toISOString() : null,
  answers: reg.answers ?? {},
});

/** Takes one seat or throws 409 full. */
async function takeSeat(slug, capacity) {
  for (let i = 0; i < 4; i += 1) {
    try {
      const filter = Number.isInteger(capacity) ? { eventSlug: slug, taken: { $lt: capacity } } : { eventSlug: slug };
      const doc = await Seats.findOneAndUpdate(filter, { $inc: { taken: 1 } }, { upsert: true, new: true });
      if (doc) return;
    } catch (e) {
      if (!isDup(e)) throw e;
      // Either the document exists and is full (the filter missed, the upsert collided), or two first-ever joins raced to create it.
      const cur = await Seats.findOne({ eventSlug: slug }).lean();
      if (cur && Number.isInteger(capacity) && cur.taken >= capacity) break;
    }
  }
  throw new HttpError(409, 'full', 'This event is full.');
}

const giveSeatBack = (slug) => Seats.updateOne({ eventSlug: slug, taken: { $gt: 0 } }, { $inc: { taken: -1 } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A `pending` claim older than this belongs to a request that died: it may be taken over. */
const CLAIM_STALE_MS = 30_000;

/**
 * Claim the (uid, event) registration row for ONE request: a `pending` row only that request will finish. Parallel joins by the same
 * devotee lose the claim (and wait for the winner's result), so they never each take a seat. Returns the claimed row, or - when the
 * devotee is already in - that joined row (`joined: true`).
 */
async function claim({ uid, slug, t }) {
  for (let i = 0; i < 40; i += 1) {
    const cur = await Registration.findOne({ uid, eventSlug: slug }).lean();
    if (cur?.status === 'joined') return { joined: true, row: cur };
    if (!cur) {
      try {
        return { row: (await Registration.create({ uid, eventSlug: slug, status: 'pending' })).toObject() };
      } catch (e) {
        if (!isDup(e)) throw e;
        continue; // somebody created it a moment ago: look again
      }
    }
    const stale = cur.status === 'pending' && t.getTime() - new Date(cur.updatedAt).getTime() > CLAIM_STALE_MS;
    if (cur.status === 'cancelled' || stale) {
      const took = await Registration.findOneAndUpdate({ _id: cur._id, status: cur.status, updatedAt: cur.updatedAt }, { $set: { status: 'pending' } }, { new: true, lean: true });
      if (took) return { row: took };
      continue;
    }
    await sleep(50); // another request of this devotee is mid-join: wait for it
  }
  throw new HttpError(503, 'busy', 'Please try again.');
}

export async function join({ event, uid, answers, now }) {
  if (!event?.published) throw new HttpError(404, 'not_found', 'Event not found.');
  const reg = event.registration;
  if (!hasRegistration(event)) throw new HttpError(409, 'closed', 'This event does not take registrations.');
  const existing = await Registration.findOne({ uid, eventSlug: event.slug }).lean();
  if (existing?.status === 'joined') return view(existing, event); // idempotent: the same registration again
  if (reg.mode === 'coins') throw new HttpError(409, 'paid_not_available', 'Paid events are not available yet.');
  const t = now();
  if (deriveStatus(event, t) === 'ended' || !registrationWindowOpen(reg, t.getTime())) throw new HttpError(409, 'closed', 'Registration is closed.');
  const clean = validateAnswers(reg.fields, answers);

  const claimed = await claim({ uid, slug: event.slug, t });
  if (claimed.joined) return view(claimed.row, event);
  const release = () => Registration.updateOne({ _id: claimed.row._id, status: 'pending' }, { $set: { status: 'cancelled', passCode: '' } });
  try {
    await takeSeat(event.slug, reg.capacity);
  } catch (e) {
    await release();
    throw e;
  }
  for (let tries = 0; tries < 8; tries += 1) {
    const passCode = reg.pass ? makePassCode(event.slug) : '';
    try {
      const doc = await Registration.findOneAndUpdate(
        { _id: claimed.row._id, status: 'pending' },
        { $set: { status: 'joined', passCode, answers: clean, joinedAt: t, checkedInAt: null } },
        { new: true },
      );
      if (doc) return view(doc.toObject(), event);
      break; // our claim was taken over (we stalled for 30 s): give the seat back
    } catch (e) {
      if (!isDup(e)) { await giveSeatBack(event.slug); await release(); throw e; }
      // the pass code collided with someone else's: try another
    }
  }
  await giveSeatBack(event.slug);
  await release();
  throw new HttpError(503, 'busy', 'Could not issue a pass. Please try again.');
}

export async function leave({ event, uid, now }) {
  if (!event?.published) throw new HttpError(404, 'not_found', 'Event not found.');
  const reg = await Registration.findOne({ uid, eventSlug: event.slug }).lean();
  if (!reg || reg.status !== 'joined') return; // nothing to leave (idempotent 204)
  const s = event.schedule;
  if (s && s.mode !== 'always' && s.startsAt && new Date(s.startsAt).getTime() <= now().getTime()) {
    throw new HttpError(409, 'started', 'You can only leave before the event starts.');
  }
  const flipped = await Registration.findOneAndUpdate({ _id: reg._id, status: 'joined' }, { $set: { status: 'cancelled', passCode: '' } });
  if (flipped) await giveSeatBack(event.slug);
}
