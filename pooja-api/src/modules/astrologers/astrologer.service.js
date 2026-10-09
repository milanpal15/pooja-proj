import mongoose from 'mongoose';

import { HttpError } from '../../lib/http-error.js';
import { getNumberSetting } from '../../lib/settings.js';
import { User } from '../../models.js';
import { CallSession } from '../calls/call.model.js';
import * as callService from '../calls/call.service.js';
import { Astrologer, effectivePresence } from './astrologer.model.js';

const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RX = /^\+[1-9]\d{6,14}$/;

const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean);

export const normalizeEmail = (v) => String(v ?? '').trim().toLowerCase();
/** E.164: keep the leading +, drop spaces/dashes/brackets. No guessing a country code. */
export const normalizePhone = (v) => String(v ?? '').replace(/[\s\-().]/g, '');

/**
 * Validate and normalise an operator's astrologer form. `partial` (PUT) only
 * touches the fields that were sent. Returns the values to assign, with
 * `undefined` meaning "clear this field".
 */
export async function cleanInput(body, { partial = false } = {}) {
  const b = body ?? {};
  const out = {};
  const has = (k) => b[k] !== undefined;

  if (!partial || has('name')) {
    const name = String(b.name ?? '').trim();
    if (!name) throw new HttpError(400, 'name_required', 'Give the astrologer a display name.');
    out.name = name;
  }
  if (!partial || has('ratePerMin')) {
    const r = Number(b.ratePerMin);
    if (!Number.isInteger(r) || r < 1) throw new HttpError(400, 'bad_rate', 'Rate must be a whole number of coins per minute (at least 1).');
    out.ratePerMin = r;
  }
  if (has('platformSharePct') || !partial) {
    const raw = has('platformSharePct') ? b.platformSharePct : await getNumberSetting('defaultSharePct', 30);
    const s = Number(raw);
    if (!Number.isFinite(s) || s < 0 || s > 100) throw new HttpError(400, 'bad_share', 'Platform share must be between 0 and 100.');
    out.platformSharePct = s;
  }
  if (has('bio')) out.bio = String(b.bio ?? '');
  if (has('photoUrl')) out.photoUrl = String(b.photoUrl ?? '');
  if (has('specialities')) out.specialities = list(b.specialities);
  if (has('languages')) out.languages = list(b.languages);
  if (has('yearsExperience')) {
    const y = Number(b.yearsExperience);
    if (!Number.isFinite(y) || y < 0) throw new HttpError(400, 'bad_years', 'Years of experience cannot be negative.');
    out.yearsExperience = y;
  }
  if (has('listed')) out.listed = !!b.listed;

  if (has('signInEmail')) {
    const e = normalizeEmail(b.signInEmail);
    if (e && !EMAIL_RX.test(e)) throw new HttpError(400, 'bad_email', 'That is not a valid e-mail address.');
    out.signInEmail = e || undefined;
  }
  if (has('signInPhone')) {
    const p = normalizePhone(b.signInPhone);
    if (p && !PHONE_RX.test(p)) throw new HttpError(400, 'bad_phone', 'Enter the mobile number with its country code, e.g. +919876543210.');
    out.signInPhone = p || undefined;
  }
  return out;
}

/** One identifier belongs to one astrologer. */
export async function assertUnique({ signInEmail, signInPhone }, exceptId) {
  const or = [];
  if (signInEmail) or.push({ signInEmail });
  if (signInPhone) or.push({ signInPhone });
  if (!or.length) return;
  const clash = await Astrologer.findOne({ $or: or, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('name').lean();
  if (clash) throw new HttpError(409, 'duplicate_identifier', `That sign-in is already used by ${clash.name}.`);
}

export const isDup = (e) => e?.code === 11000;
export const dupError = () => new HttpError(409, 'duplicate_identifier', 'That sign-in e-mail or number is already used by another astrologer.');

export const validId = (id) => mongoose.isValidObjectId(id);

/** Real ratings only; both fields are absent until there is at least one. */
async function ratingsFor(ids) {
  return callService.ratingsFor(ids);
}

export function publicView(a, rating, now = Date.now()) {
  return {
    id: String(a._id),
    name: a.name,
    bio: a.bio,
    photoUrl: a.photoUrl,
    specialities: a.specialities,
    languages: a.languages,
    yearsExperience: a.yearsExperience,
    ratePerMin: a.ratePerMin,
    presence: effectivePresence(a, now),
    ...(rating ?? {}),
  };
}

export async function listPublic() {
  const rows = await Astrologer.find({ status: 'active', listed: true }).lean();
  const ratings = await ratingsFor(rows.map((r) => r._id));
  const order = { online: 0, busy: 1, offline: 2 };
  return rows
    .map((a) => publicView(a, ratings.get(String(a._id))))
    .sort((a, b) => order[a.presence] - order[b.presence] || a.name.localeCompare(b.name));
}

export async function getPublic(id) {
  const a = validId(id) ? await Astrologer.findById(id).lean() : null;
  if (!a || a.status !== 'active' || !a.listed) throw new HttpError(404, 'astrologer_not_found', 'Astrologer not found.');
  const ratings = await ratingsFor([a._id]);
  return publicView(a, ratings.get(String(a._id)));
}

/** Dashboard row. Operators may see sign-in identifiers; nobody else may. */
export async function adminRows() {
  const rows = await Astrologer.find().sort({ createdAt: -1 }).lean();
  const ids = rows.map((r) => r._id);
  const since = new Date(Date.now() - 30 * 86400_000);
  const [ratings, counts] = await Promise.all([
    ratingsFor(ids),
    CallSession.aggregate([
      { $match: { astrologerId: { $in: ids }, answeredAt: { $gte: since } } },
      { $group: { _id: '$astrologerId', n: { $sum: 1 } } },
    ]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  return rows.map((a) => ({
    id: String(a._id),
    name: a.name,
    bio: a.bio,
    photoUrl: a.photoUrl,
    specialities: a.specialities,
    languages: a.languages,
    yearsExperience: a.yearsExperience,
    ratePerMin: a.ratePerMin,
    platformSharePct: a.platformSharePct,
    signInEmail: a.signInEmail ?? '',
    signInPhone: a.signInPhone ?? '',
    status: a.status,
    signedIn: !!a.uid,
    listed: a.listed,
    presence: effectivePresence(a),
    lastSeenAt: a.lastSeenAt ?? null,
    lastSignInAt: a.lastSignInAt ?? null,
    calls30d: byId.get(String(a._id)) ?? 0,
    ...(ratings.get(String(a._id)) ?? {}),
  }));
}

export async function adminRow(id) {
  return (await adminRows()).find((r) => r.id === String(id));
}

/** Take the role away (suspend / delete / identifier change) without stranding a call. */
export async function revokeRole(a) {
  await Astrologer.updateOne({ _id: a._id }, { $set: { presence: 'offline' } });
  // The minute already charged stands; the call just stops being billed.
  await callService.endLiveCallsOf(a._id);
  if (a.uid) await User.updateOne({ uid: a.uid }, { $set: { role: 'devotee' } });
}
