import { asyncRouter } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { can, onlyFrom } from '../lib/perms.js';
import { permissionsOfRole } from '../lib/roles.js';
import { hasPermission } from '../lib/perms.js';
import { isBlocked, phoneBlock } from '../lib/blocks.js';
import { Operator, User } from '../models/index.js';

const SERVICES = ['monolith', 'catalog', 'wallet', 'orders', 'calls'];
/** The events service asks ONE thing (names for the operator participants list, only when the operator may see them): batch lookup. */
const LOOKUP_FROM = [...SERVICES, 'events'];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * What the other services (today: the monolith) may ask about a devotee, by uid. Narrow on purpose - names, a contact,
 * a push device id and the role; never the profile. /internal/identity/directory/*
 */
export function directoryRoutes() {
  const r = asyncRouter();
  const from = onlyFrom(...SERVICES);

  r.get('/users/:uid', from, async (req, res) => {
    const u = await User.findOne({ uid: req.params.uid }).select('uid name contact deviceId role').lean();
    if (!u) return res.status(404).json({ error: 'user not found', code: 'not_found' });
    res.json({ user: { uid: u.uid, name: u.name || '', contact: u.contact || '', deviceId: u.deviceId || null, role: u.role || 'devotee' } });
  });

  /**
   * How many ACTIVE operators hold a permission (engagement asks `approvals:edit`: a risky version change needs a second approver, unless
   * the requester is the only one who could approve). Counts only - no names leave this service.
   */
  r.get('/approvers', onlyFrom('engagement'), async (req, res) => {
    const perm = String(req.query.perm ?? 'approvals:edit');
    if (!/^[a-z]+:(view|edit)$/.test(perm)) throw new HttpError(400, 'bad_request', 'perm must look like approvals:edit.');
    const operators = await Operator.find({ active: true }).select('role').lean();
    const roles = [...new Set(operators.map((o) => o.role))];
    const held = new Map(await Promise.all(roles.map(async (k) => [k, hasPermission(await permissionsOfRole(k), perm)])));
    res.json({ perm, count: operators.filter((o) => held.get(o.role)).length });
  });

  /** Names for the admin `who` column. */
  r.post('/lookup', onlyFrom(...LOOKUP_FROM), async (req, res) => {
    const uids = req.body?.uids;
    if (!Array.isArray(uids) || uids.length > 500 || uids.some((x) => typeof x !== 'string')) throw new HttpError(400, 'bad_request', 'uids[] (strings, at most 500) required.');
    const rows = await User.find({ uid: { $in: uids } }).select('uid name contact').lean();
    res.json({ users: rows.map((u) => ({ uid: u.uid, name: u.name || '', contact: u.contact || '' })) });
  });

  /** Wallet lookup: a search over names and phones, so the caller must carry the operator's `devotees:view`. */
  r.get('/search', from, async (req, res) => {
    if (!can(req, 'devotees:view')) throw new HttpError(403, 'forbidden', "You don't have permission for that.", { needs: 'devotees:view' });
    const q = String(req.query.q ?? '').trim().slice(0, 80);
    if (!q) return res.json({ users: [] });
    const rx = new RegExp(escapeRe(q), 'i');
    const rows = await User.find({ $or: [{ name: rx }, { contact: rx }, { email: rx }, { phone: rx }] }).limit(20).lean();
    res.json({ users: rows.map((u) => ({ uid: u.uid, name: u.name || '', contact: u.contact || '', email: u.email || '', phone: u.phone || '' })) });
  });

  /** Keep the convenience role in step with the astrologer lifecycle (the monolith's suspend / reactivate / delete). */
  r.put('/users/:uid/role', from, async (req, res) => {
    const role = req.body?.role;
    if (!['devotee', 'astrologer'].includes(role)) throw new HttpError(400, 'bad_request', 'role must be devotee or astrologer.');
    await User.updateOne({ uid: req.params.uid }, { $set: { role } });
    res.json({ ok: true });
  });
  return r;
}

/** What the mobile BFF asks on EVERY authenticated request: is this uid blocked, and what should the token vouch for? */
export function statusRoutes({ now = () => new Date() } = {}) {
  const r = asyncRouter();
  r.get('/users/:uid/status', onlyFrom('mobile-bff', ...SERVICES), async (req, res) => {
    const u = await User.findOne({ uid: req.params.uid }).select('blocked block name role').lean();
    // A timed block that has run out is NOT blocked, immediately (docs/USERS.md section 1). A blocked answer carries only the words the person reads.
    const blocked = isBlocked(u, now());
    res.json({
      exists: !!u,
      blocked,
      name: u?.name || '',
      role: u?.role === 'astrologer' ? 'astrologer' : 'devotee',
      ...(blocked ? { block: phoneBlock(u.block) } : {}),
    });
  });
  return r;
}
