import mongoose from 'mongoose';
import { AUDIT_DETAIL_HEADER, EXPORT_CAP, EXPORT_PAGE, encodeAuditDetail, sanitizeAuditValue } from '@bhakti/common';

import { asyncRouter } from '../lib/async-handler.js';
import { applyBlock, applyUnblock } from '../lib/block-actions.js';
import { HttpError } from '../lib/http-error.js';
import {
  NOTES_LIMIT, NOTE_MAX, applyTags, auditBlock, isBlocked, parseBlockBody,
} from '../lib/blocks.js';
import { can, onlyFrom, requirePerm } from '../lib/perms.js';
import { buildFilter, cursorCondition, encodeCursor, parseListQuery, sortSpec } from '../lib/user-query.js';
import { latestDeviceByUid, userProfile, userRow } from '../lib/user-views.js';
import { RECENT, section, shapeCalls, shapeEvents, shapeOrders, shapeWallet } from '../lib/user360.js';
import { AuditLog, BlockedDevice, PushDevice, User } from '../models/index.js';

const operatorOf = (req) => String(req.auth?.ctx?.username || req.auth?.sub || 'unknown').slice(0, 80);
const detail = (res, before, after) => res.setHeader(AUDIT_DETAIL_HEADER, encodeAuditDetail({ before, after }));
const notFound = () => new HttpError(404, 'not_found', 'user not found');

/**
 * Devotee administration (the dashboard's Users module) - docs/USERS.md section 2. Mounted at /admin/users.
 *
 * Area `devotees`: the admin BFF applies the gate and this service re-checks the permission from the signed token. The list is server-side
 * everything (search, filters, cursor paging); the 360 view fans out to the other services with a short timeout per section; every write
 * leaves its before / after in the `X-Audit-Detail` header for the BFF's audit hook.
 *
 * @param {{ firebase: object, sources: object, redact: object, config: object, now?: () => Date, logger?: object }} deps
 */
export function userAdminRoutes({ firebase, sources, redact, config, now = () => new Date(), logger }) {
  const r = asyncRouter();
  r.use(onlyFrom('admin-bff'));
  const view = requirePerm('devotees:view');
  const edit = requirePerm('devotees:edit');
  const maskIfNeeded = (req, row) => (can(req, 'devotees:view') ? row : redact.maskUser(row));

  const userById = async (id, { lean = false } = {}) => {
    if (!mongoose.isValidObjectId(id)) throw notFound();
    const q = User.findById(id);
    const doc = await (lean ? q.lean() : q);
    if (!doc) throw notFound();
    return doc;
  };

  /** Accounts this person's devices are known by: the registry plus the id they gave at sign-in. */
  async function deviceIdsOf(user, reqId) {
    const ids = new Set(user.deviceId ? [user.deviceId] : []);
    try {
      for (const d of await sources.devicesByUids([user.uid], reqId)) if (d?.deviceId) ids.add(d.deviceId);
    } catch (e) {
      logger?.warn(`device lookup for ${user.uid} failed (${e?.code || e?.message}): using the sign-in device id only`);
    }
    return [...ids].slice(0, 20);
  }

  /** Accounts on a version, or an explicit 503: a filter that cannot be answered must not silently show everyone. */
  async function versionUids(code, reqId) {
    try {
      return await sources.uidsOnVersion(code, reqId);
    } catch (e) {
      throw new HttpError(503, 'devices_unavailable', 'The device registry is unavailable, so the app version filter cannot be applied right now.', { reason: e?.code || 'upstream_error' });
    }
  }

  /** Accounts are created by auth sync with a verified Firebase token. `POST /users` answers 410 so an old build gets a clear reply. */
  r.post('/', edit, (_req, res) =>
    res.status(410).json({
      error: 'gone',
      detail: 'Sign-in now goes through Firebase. Use POST /api/auth/sync with a Bearer ID token.',
    }),
  );

  /** The old unpaginated list: kept for one release, not used by the dashboard. */
  r.get('/', view, async (_req, res) => res.json(await User.find().sort({ lastActive: -1 }).lean()));

  /* ------------------------------------------------------------------- the list -- */
  r.get('/list', view, async (req, res) => {
    const parsed = parseListQuery(req.query);
    if (parsed.fields) throw new HttpError(400, 'bad_filter', 'Some filters are not valid.', { fields: parsed.fields });
    const { query } = parsed;
    const at = now();
    const versioned = query.versionCode !== undefined ? await versionUids(query.versionCode, req.id) : null;
    const filter = buildFilter(query, { now: at, uids: versioned?.uids });
    const cur = cursorCondition(query, query.cursor);
    if (cur.bad) throw new HttpError(400, 'bad_cursor', 'That page marker is not valid; start again from the first page.');

    const rows = await User.find(cur.after ? { $and: [filter, cur.after] } : filter)
      .sort(sortSpec(query))
      .limit(query.limit + 1)
      .lean();
    const page = rows.slice(0, query.limit);
    const next = rows.length > query.limit ? encodeCursor(query, page[page.length - 1]) : null;

    // One batched registry call and one batched push lookup for the whole page.
    const uids = page.map((u) => u.uid).filter(Boolean);
    let devices = new Map();
    let versionsUnavailable = false;
    const [registry, pushes, total] = await Promise.all([
      uids.length
        ? sources.devicesByUids(uids, req.id).catch((e) => {
            if (e?.code !== 'not_configured') logger?.warn(`device registry unavailable for the user list (${e?.code || e?.message})`);
            versionsUnavailable = true;
            return [];
          })
        : [],
      uids.length ? PushDevice.find({ uid: { $in: uids } }).select('uid').lean() : [],
      query.cursor ? null : countUsers(filter),
    ]);
    devices = latestDeviceByUid(registry);
    const pushing = new Set(pushes.map((p) => p.uid));
    res.json({
      users: page.map((u) => maskIfNeeded(req, userRow(u, { now: at, device: devices.get(u.uid), hasPush: pushing.has(u.uid) }))),
      next,
      total,
      ...(versionsUnavailable ? { versionsUnavailable: true } : {}),
      ...(versioned?.truncated ? { versionFilterTruncated: true } : {}),
    });
  });

  /** The page-one count: exact up to 100 000 and within 1.5 s, else null ("many"). */
  async function countUsers(filter) {
    try {
      const n = await User.countDocuments(filter).limit(100_001).maxTimeMS(1500);
      return n > 100_000 ? null : n;
    } catch {
      return null;
    }
  }

  /* ------------------------------------------------------------------- CSV export -- */
  /**
   * One page of the export (the admin BFF turns the pages into a streamed CSV). Needs `devotees:edit` and is NEVER masked: the CSV is an
   * admin-visible file, so there is no masked-then-unmasked path. The first page (no cursor) writes the audit row - filter and expected
   * row count - BEFORE any data leaves, so an aborted download is still on record.
   */
  r.get('/export', edit, async (req, res) => {
    const parsed = parseListQuery({ ...req.query, limit: '1', sort: 'createdAt', cursor: undefined });
    if (parsed.fields) throw new HttpError(400, 'bad_filter', 'Some filters are not valid.', { fields: parsed.fields });
    const { query } = parsed;
    const rawLimit = Number(req.query.limit);
    const already = Math.max(0, Number(req.query.already) || 0);
    const limit = Math.min(Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : EXPORT_PAGE, EXPORT_PAGE, Math.max(0, EXPORT_CAP - already));
    const after = typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : null;
    if (after && !mongoose.isValidObjectId(after)) throw new HttpError(400, 'bad_cursor', 'That page marker is not valid.');
    const at = now();
    const versioned = query.versionCode !== undefined ? await versionUids(query.versionCode, req.id) : null;
    const filter = buildFilter(query, { now: at, uids: versioned?.uids });
    const ids = typeof req.query.ids === 'string' && req.query.ids ? req.query.ids.split(',').map((x) => x.trim()).filter(Boolean) : null;
    if (ids && (ids.length > 1000 || !ids.every((x) => mongoose.isValidObjectId(x)))) throw new HttpError(400, 'bad_filter', 'ids must be a comma list of at most 1000 user ids.', { fields: { ids: 'Not a list of user ids.' } });
    if (ids) filter.$and = [...(filter.$and ?? []), { _id: { $in: ids.map((x) => new mongoose.Types.ObjectId(x)) } }];
    const where = after ? { $and: [filter, { _id: { $gt: new mongoose.Types.ObjectId(after) } }] } : filter;

    let expected;
    if (!after) {
      const n = await User.countDocuments(filter).maxTimeMS(10_000);
      expected = Math.min(n, EXPORT_CAP);
      await AuditLog.create({
        operator: operatorOf(req),
        role: req.auth?.role,
        area: 'devotees',
        method: 'GET',
        path: '/api/admin/users/export',
        status: 200,
        after: sanitizeAuditValue({
          export: 'users',
          filter: Object.fromEntries(Object.entries({ ...(ids ? { ids: ids.length } : {}), ...query, limit: undefined, cursor: undefined, sort: undefined, dir: undefined }).filter(([, v]) => v !== undefined && v !== '' && v !== 'all')),
          rows: expected,
          capped: n > EXPORT_CAP,
        }),
        at,
      });
    }

    const rows = limit ? await User.find(where).sort({ _id: 1 }).limit(limit).lean() : [];
    let devices = new Map();
    let versionsUnavailable = false;
    const uids = rows.map((u) => u.uid).filter(Boolean);
    if (uids.length) {
      try {
        devices = latestDeviceByUid(await sources.devicesByUids(uids, req.id));
      } catch {
        versionsUnavailable = true;
      }
    }
    const last = rows[rows.length - 1];
    const exhausted = rows.length < limit || already + rows.length >= EXPORT_CAP;
    res.json({
      rows: rows.map((u) => {
        const d = devices.get(u.uid);
        return {
          id: String(u._id), uid: u.uid ?? '', name: u.name || '', contact: u.contact || '', method: u.method || '',
          role: u.role === 'astrologer' ? 'astrologer' : 'devotee', blocked: isBlocked(u, at), tags: u.tags ?? [],
          createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : '', lastActive: u.lastActive ? new Date(u.lastActive).toISOString() : '',
          version: d ? `${d.versionName ?? ''}${d.versionCode != null ? ` (${d.versionCode})` : ''}`.trim() : '',
        };
      }),
      next: exhausted || !last ? null : String(last._id),
      capped: already + rows.length >= EXPORT_CAP,
      ...(expected !== undefined ? { expected } : {}),
      ...(versionsUnavailable ? { versionsUnavailable: true } : {}),
    });
  });

  /* ------------------------------------------------------------------- the 360 view -- */
  r.get('/:id', view, async (req, res) => {
    const u = await userById(req.params.id, { lean: true });
    const at = now();
    const ms = config.sectionTimeoutMs ?? 1500;
    const uid = u.uid;
    const noUid = () => { throw Object.assign(new Error('this account has no uid yet'), { code: 'not_configured' }); };
    const run = (name, allowed, fn) => section({ allowed, timeoutMs: ms, fn, logger, name });

    const [devices, wallet, bookings, events, calls, audit] = await Promise.all([
      run('devices', true, async () => {
        if (!uid) return [];
        const registry = await sources.devicesByUids([uid], req.id);
        const ids = registry.map((d) => d.deviceId).filter(Boolean);
        const blocked = new Set(
          ids.length ? (await BlockedDevice.find({ deviceId: { $in: ids } }).lean()).filter((b) => !b.until || b.until > at).map((b) => b.deviceId) : [],
        );
        return registry
          .sort((a, b) => new Date(b.lastSeen ?? 0) - new Date(a.lastSeen ?? 0))
          .slice(0, 20)
          .map((d) => ({
            deviceId: d.deviceId, versionName: d.versionName ?? null, versionCode: d.versionCode ?? null, osApi: d.osApi ?? null, model: d.model ?? null,
            platform: d.platform ?? null, firstSeen: d.firstSeen ?? null, lastSeen: d.lastSeen ?? null, hasPush: d.hasPush === true, blocked: blocked.has(d.deviceId),
          }));
      }),
      run('wallet', can(req, 'wallets:view'), async () => (uid ? shapeWallet(await sources.wallet(uid, req.id)) : noUid())),
      run('bookings', can(req, 'orders:view'), async () => (uid ? shapeOrders(await sources.orders(uid, req.id)) : noUid())),
      run('events', can(req, 'events:view'), async () => (uid ? shapeEvents(await sources.events(uid, req.id)) : noUid())),
      run('calls', can(req, 'calls:view'), async () => (uid ? shapeCalls(await sources.calls(uid, req.id)) : noUid())),
      run('audit', can(req, 'audit:view'), async () =>
        (await AuditLog.find({ targetId: String(u._id) }).sort({ _id: -1 }).limit(RECENT).lean()).map((a) => ({
          id: String(a._id), at: a.at, operator: a.operator, method: a.method, path: a.path, summary: `${a.method} ${String(a.path).replace(/^\/api\/admin\/users\/[0-9a-f]{24}\/?/i, '') || 'user'}`, status: a.status, ...(a.before !== undefined ? { before: a.before } : {}), ...(a.after !== undefined ? { after: a.after } : {}),
        })),
      ),
    ]);
    res.json({ user: maskIfNeeded(req, userProfile(u, { now: at })), devices, wallet, bookings, events, calls, audit });
  });

  /* ------------------------------------------------------------------- blocking -- */
  r.post('/:id/block', edit, async (req, res) => {
    const input = parseBlockBody(req.body, now());
    if (input.fields) throw new HttpError(400, 'bad_block', 'Check the highlighted fields.', { fields: input.fields });
    const doc = await userById(req.params.id);
    if (doc.role === 'astrologer' && !can(req, 'astrologers:edit')) {
      throw new HttpError(403, 'forbidden', "You don't have permission for that.", { needs: 'astrologers:edit' });
    }
    const before = auditBlock(doc, now());
    const out = await applyBlock({ doc, input: input.value, by: operatorOf(req), now: now(), firebase, deviceIds: input.value.alsoBlockDevices ? await deviceIdsOf(doc, req.id) : [] });
    detail(res, before, { ...auditBlock(out.doc, now()), devicesBlocked: out.devicesBlocked });
    res.json({ user: maskIfNeeded(req, userProfile(out.doc.toObject(), { now: now() })), devicesBlocked: out.devicesBlocked });
  });

  r.post('/:id/unblock', edit, async (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const note = typeof b.note === 'string' ? b.note.trim() : '';
    if (note.length > 300) throw new HttpError(400, 'bad_unblock', 'Check the highlighted fields.', { fields: { note: 'At most 300 characters.' } });
    if (b.unblockDevices !== undefined && typeof b.unblockDevices !== 'boolean') throw new HttpError(400, 'bad_unblock', 'Check the highlighted fields.', { fields: { unblockDevices: 'Must be true or false.' } });
    const doc = await userById(req.params.id);
    const before = auditBlock(doc, now());
    const wasBlocked = isBlocked(doc, now());
    const out = await applyUnblock({ doc, note, by: operatorOf(req), now: now(), deviceIds: b.unblockDevices === true ? await deviceIdsOf(doc, req.id) : [] });
    detail(res, before, { ...auditBlock(out.doc, now()), devicesUnblocked: out.devicesUnblocked });
    res.json({ user: maskIfNeeded(req, userProfile(out.doc.toObject(), { now: now() })), ...(wasBlocked ? {} : { unchanged: true }), devicesUnblocked: out.devicesUnblocked });
  });

  /** Revokes the refresh tokens: the phone's next token refresh fails and it returns to login. A short-lived ID token already minted works until it expires (<= 1 h). */
  r.post('/:id/sign-out', edit, async (req, res) => {
    const doc = await userById(req.params.id, { lean: true });
    if (!doc.uid) throw new HttpError(409, 'no_uid', 'This account has never signed in with Firebase, so there is nothing to sign out.');
    if (firebase.ready?.() === false) return res.json({ revoked: false, reason: 'firebase_not_configured' });
    await firebase.revokeUser(doc.uid);
    detail(res, null, { signedOut: true });
    res.json({ revoked: true });
  });

  /* ------------------------------------------------------------------- tags and notes -- */
  r.post('/:id/tags', edit, async (req, res) => {
    const doc = await userById(req.params.id);
    const out = applyTags(doc.tags, req.body);
    if (out.fields) throw new HttpError(400, 'bad_tags', 'Check the highlighted fields.', { fields: out.fields });
    const before = [...(doc.tags ?? [])];
    doc.tags = out.tags;
    await doc.save();
    detail(res, { tags: before }, { tags: out.tags });
    res.json({ user: maskIfNeeded(req, userProfile(doc.toObject(), { now: now() })) });
  });

  r.post('/:id/notes', edit, async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) throw new HttpError(400, 'bad_note', 'Write the note.', { fields: { text: 'The note is empty.' } });
    if (text.length > NOTE_MAX) throw new HttpError(400, 'bad_note', 'The note is too long.', { fields: { text: `At most ${NOTE_MAX} characters.` } });
    const id = new mongoose.Types.ObjectId().toString();
    const doc = await User.findOneAndUpdate(
      { _id: mongoose.isValidObjectId(req.params.id) ? req.params.id : null },
      { $push: { notes: { $each: [{ id, text, by: operatorOf(req), at: now() }], $position: 0, $slice: NOTES_LIMIT } } },
      { new: true },
    );
    if (!doc) throw notFound();
    detail(res, null, { note: { id, text } });
    res.status(201).json({ user: maskIfNeeded(req, userProfile(doc.toObject(), { now: now() })), note: { id, text, by: operatorOf(req), at: now().toISOString() } });
  });

  /** A note's author may remove it; so may anyone who can edit devotees. */
  r.delete('/:id/notes/:noteId', view, async (req, res) => {
    const doc = await userById(req.params.id);
    const note = (doc.notes ?? []).find((n) => n.id === req.params.noteId);
    if (!note) throw new HttpError(404, 'not_found', 'note not found');
    if (note.by !== operatorOf(req) && !can(req, 'devotees:edit')) throw new HttpError(403, 'forbidden', "You don't have permission for that.", { needs: 'devotees:edit' });
    await User.updateOne({ _id: doc._id }, { $pull: { notes: { id: req.params.noteId } } });
    const fresh = await User.findById(doc._id).lean();
    detail(res, { note: { id: note.id, text: note.text } }, null);
    res.json({ user: maskIfNeeded(req, userProfile(fresh, { now: now() })) });
  });

  /* ------------------------------------------------------------------- legacy edit -- */
  /**
   * The pre-360 edit: name, bio and the `blocked` switch. Still answered (one release) so nothing that calls it breaks; a block made this way
   * carries a stock reason and message. Use /block and /unblock for anything real.
   */
  r.put('/:id', edit, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'user not found' });
    const { name, bio, blocked } = req.body ?? {};
    let doc = await User.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'user not found' });
    const before = auditBlock(doc, now());
    if (typeof name === 'string' || typeof bio === 'string') {
      doc = await User.findByIdAndUpdate(doc._id, { $set: { ...(typeof name === 'string' ? { name } : {}), ...(typeof bio === 'string' ? { bio } : {}) } }, { new: true });
    }
    if (blocked !== undefined) {
      const was = isBlocked(doc, now());
      if (blocked && !was) {
        const out = await applyBlock({ doc, input: { reason: 'Blocked from the dashboard', message: '', messageHi: '', until: null }, by: operatorOf(req), now: now(), firebase, deviceIds: [], stock: true });
        doc = out.doc;
      } else if (!blocked && was) {
        doc = (await applyUnblock({ doc, note: '', by: operatorOf(req), now: now(), deviceIds: [] })).doc;
      } else if (blocked && doc.uid) {
        await firebase.revokeUser(doc.uid); // as before: asking again re-revokes
      }
    }
    detail(res, before, auditBlock(doc, now()));
    res.json({ ...doc.toObject(), blocked: isBlocked(doc, now()) });
  });

  /* ------------------------------------------------------------------- delete -- */
  // Removing the devotee removes the Firebase account too - otherwise the next sign-in would silently recreate the row.
  // The body must carry `confirm`: the person's contact (any case) or the last six characters of their uid.
  r.delete('/:id', edit, async (req, res) => {
    const doc = mongoose.isValidObjectId(req.params.id) ? await User.findById(req.params.id) : null;
    if (!doc) return res.json({ ok: true }); // idempotent, as before
    const typed = typeof req.body?.confirm === 'string' ? req.body.confirm.trim() : '';
    const ok = typed && ((doc.contact && typed.toLowerCase() === doc.contact.toLowerCase()) || (doc.uid && typed === doc.uid.slice(-6)));
    if (!ok) throw new HttpError(400, 'confirm_mismatch', "Type the person's contact, or the last 6 characters of their uid, to confirm.", { expects: 'contact or uid last 6' });
    await User.deleteOne({ _id: doc._id });
    if (doc.uid) await firebase.deleteFirebaseUser(doc.uid);
    detail(res, { role: doc.role || 'devotee', blocked: isBlocked(doc, now()), tags: doc.tags ?? [] }, null);
    res.json({ ok: true });
  });

  return r;
}
