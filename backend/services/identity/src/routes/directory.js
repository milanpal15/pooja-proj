import { asyncRouter } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { can, onlyFrom } from '../lib/perms.js';
import { User } from '../models/index.js';

const SERVICES = ['monolith', 'catalog', 'wallet', 'orders', 'calls'];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * What the other services (today: the monolith) may ask about a devotee, by uid. Narrow on purpose - names, a contact,
 * a push device id and the role; never the profile. /internal/identity/directory/*
 */
export function directoryRoutes() {
  const r = asyncRouter();
  r.use(onlyFrom(...SERVICES));

  r.get('/users/:uid', async (req, res) => {
    const u = await User.findOne({ uid: req.params.uid }).select('uid name contact deviceId role').lean();
    if (!u) return res.status(404).json({ error: 'user not found', code: 'not_found' });
    res.json({ user: { uid: u.uid, name: u.name || '', contact: u.contact || '', deviceId: u.deviceId || null, role: u.role || 'devotee' } });
  });

  /** Names for the admin `who` column. */
  r.post('/lookup', async (req, res) => {
    const uids = req.body?.uids;
    if (!Array.isArray(uids) || uids.length > 500 || uids.some((x) => typeof x !== 'string')) throw new HttpError(400, 'bad_request', 'uids[] (strings, at most 500) required.');
    const rows = await User.find({ uid: { $in: uids } }).select('uid name contact').lean();
    res.json({ users: rows.map((u) => ({ uid: u.uid, name: u.name || '', contact: u.contact || '' })) });
  });

  /** Wallet lookup: a search over names and phones, so the caller must carry the operator's `devotees:view`. */
  r.get('/search', async (req, res) => {
    if (!can(req, 'devotees:view')) throw new HttpError(403, 'forbidden', "You don't have permission for that.", { needs: 'devotees:view' });
    const q = String(req.query.q ?? '').trim().slice(0, 80);
    if (!q) return res.json({ users: [] });
    const rx = new RegExp(escapeRe(q), 'i');
    const rows = await User.find({ $or: [{ name: rx }, { contact: rx }, { email: rx }, { phone: rx }] }).limit(20).lean();
    res.json({ users: rows.map((u) => ({ uid: u.uid, name: u.name || '', contact: u.contact || '', email: u.email || '', phone: u.phone || '' })) });
  });

  /** Keep the convenience role in step with the astrologer lifecycle (the monolith's suspend / reactivate / delete). */
  r.put('/users/:uid/role', async (req, res) => {
    const role = req.body?.role;
    if (!['devotee', 'astrologer'].includes(role)) throw new HttpError(400, 'bad_request', 'role must be devotee or astrologer.');
    await User.updateOne({ uid: req.params.uid }, { $set: { role } });
    res.json({ ok: true });
  });
  return r;
}

/** What the mobile BFF asks on EVERY authenticated request: is this uid blocked, and what should the token vouch for? */
export function statusRoutes() {
  const r = asyncRouter();
  r.get('/users/:uid/status', onlyFrom('mobile-bff', ...SERVICES), async (req, res) => {
    const u = await User.findOne({ uid: req.params.uid }).select('blocked name role').lean();
    res.json({ exists: !!u, blocked: !!u?.blocked, name: u?.name || '', role: u?.role === 'astrologer' ? 'astrologer' : 'devotee' });
  });
  return r;
}
