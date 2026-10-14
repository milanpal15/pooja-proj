import { asyncRouter } from '../../lib/async-handler.js';
import { ctx } from '../../lib/context.js';
import { HttpError } from '../../lib/http-error.js';
import { requireDevotee } from '../../lib/perms.js';
import { CallSession } from '../calls/call.model.js';
import { AstrologerEarning } from '../payouts/payout.model.js';
import * as callService from '../calls/call.service.js';
import { requireAstrologer } from './astrologer.guard.js';
import { Astrologer, effectivePresence } from './astrologer.model.js';
import { claimActiveAstrologer } from './claim.js';
import * as svc from './astrologer.service.js';

/**
 * Astrologer endpoints (contract §4) - the monolith's paths, status codes and bodies, byte for byte.
 *
 *   public     GET  /astrologers, /astrologers/:id          (listed + active only; either BFF)
 *   astrologer /astrologer/me/*                             (mobile BFF; uid = the signed `sub`, then the active-astrologer check in THIS database)
 *   admin      /admin/astrologers CRUD, suspend, reactivate (admin BFF, area `astrologers`; sign-in identifiers masked without astrologers:edit)
 *   directory  POST /directory/astrologers/claim, GET /directory/astrologers/active?uid=      (identity ONLY: the sign-in claim)
 *
 * `/astrologer/me/earnings` is served by the payouts module.
 */
export function astrologerRouters() {
  const pub = asyncRouter();
  const devotee = asyncRouter();
  const admin = asyncRouter();
  const directory = asyncRouter();

  pub.get('/astrologers', async (_req, res) => res.json({ astrologers: await svc.listPublic() }));
  pub.get('/astrologers/:id', async (req, res) => res.json({ astrologer: await svc.getPublic(req.params.id) }));

  /* ------------------------------------------------ astrologer's own side -- */
  const me = [requireDevotee, requireAstrologer];

  devotee.get('/astrologer/me', ...me, async (req, res) => {
    const a = req.astrologer;
    const row = await svc.adminRow(a._id);
    // Their own record, minus the sign-in identifiers they already know.
    const { signInEmail: _e, signInPhone: _p, ...mine } = row;
    res.json({ astrologer: mine });
  });

  devotee.put('/astrologer/me/presence', ...me, async (req, res) => {
    const { online, presence } = req.body ?? {};
    if (presence === 'busy' || typeof online !== 'boolean') {
      throw new HttpError(400, 'bad_presence', 'Send { online: true|false }. Busy is set by the server.');
    }
    const a = req.astrologer;
    if (online) {
      const reachable = await ctx.identity.pushReachable?.(req.token.uid); // undefined = identity could not say: leave the flag as it was
      const next = await Astrologer.findOneAndUpdate(
        { _id: a._id, status: 'active' },
        [{ $set: { lastSeenAt: '$$NOW', ...(typeof reachable === 'boolean' ? { pushReachable: reachable } : {}), presence: { $cond: [{ $eq: ['$presence', 'busy'] }, 'busy', 'online'] } } }],
        { new: true },
      );
      return res.json({ presence: effectivePresence(next) });
    }
    if (await CallSession.exists({ astrologerId: a._id, status: 'connected' })) {
      throw new HttpError(409, 'on_a_call', 'You are on a call. End it before going offline.');
    }
    await Astrologer.updateOne({ _id: a._id }, { $set: { presence: 'offline', lastSeenAt: new Date() } });
    res.json({ presence: 'offline' });
  });

  devotee.post('/astrologer/me/heartbeat', ...me, async (req, res) => {
    // Re-evaluated on every beat (identity's answer is cached ~60 s) so registering - or losing - a phone takes effect without toggling Online.
    const reachable = await ctx.identity.pushReachable?.(req.token.uid);
    await Astrologer.updateOne({ _id: req.astrologer._id }, { $set: { lastSeenAt: new Date(), ...(typeof reachable === 'boolean' ? { pushReachable: reachable } : {}) } });
    res.json({ ok: true });
  });

  devotee.get('/astrologer/me/incoming', ...me, async (req, res) => {
    const ringMs = (await ctx.settings.getNumber('ringTimeoutSec', 25, { lenient: true })) * 1000;
    const call = await CallSession.findOne({
      astrologerUid: req.token.uid,
      status: 'requested',
      requestedAt: { $gte: new Date(Date.now() - ringMs) },
    }).sort({ requestedAt: -1 });
    res.json({ call: call ? await callService.toView(call, { viewerUid: req.token.uid }) : null });
  });

  devotee.get('/astrologer/me/calls', ...me, async (req, res) => {
    const q = { astrologerUid: req.token.uid };
    if (req.query.before) {
      const d = new Date(String(req.query.before));
      if (!Number.isNaN(+d)) q.requestedAt = { $lt: d };
    }
    const rows = await CallSession.find(q).sort({ requestedAt: -1 }).limit(Math.min(Number(req.query.limit) || 30, 100)).lean();
    const earned = await AstrologerEarning.aggregate([
      { $match: { callId: { $in: rows.map((c) => c._id) }, voidedAt: { $exists: false } } },
      { $group: { _id: '$callId', paise: { $sum: '$paise' } } },
    ]);
    const paise = new Map(earned.map((e) => [String(e._id), e.paise]));
    res.json({
      // First name only, and what THEY earned — never what the devotee paid.
      calls: rows.map((c) => {
        const { coins: _paid, ...row } = callService.toRow(c, { forAstrologer: true });
        return { ...row, earnedPaise: paise.get(String(c._id)) ?? 0 };
      }),
    });
  });

  /* ------------------------------------------------------------ dashboard -- */
  admin.get('/admin/astrologers', async (req, res) => res.json({ astrologers: ctx.redact.redactAstrologerRows(await svc.adminRows(), req) }));

  admin.post('/admin/astrologers', async (req, res) => {
    const data = await svc.cleanInput(req.body);
    if (!data.signInEmail && !data.signInPhone) {
      throw new HttpError(400, 'identifier_required', 'Add the e-mail or mobile number this astrologer will sign in with.');
    }
    await svc.assertUnique(data);
    let a;
    try {
      a = await Astrologer.create({ ...data, status: 'invited', presence: 'offline' });
    } catch (e) {
      throw svc.isDup(e) ? svc.dupError() : e;
    }
    res.status(201).json({ astrologer: await svc.adminRow(a._id) });
  });

  async function load(id) {
    const a = svc.validId(id) ? await Astrologer.findById(id) : null;
    if (!a) throw new HttpError(404, 'astrologer_not_found', 'Astrologer not found.');
    return a;
  }

  admin.put('/admin/astrologers/:id', async (req, res) => {
    const a = await load(req.params.id);
    const data = await svc.cleanInput(req.body, { partial: true });
    await svc.assertUnique({ signInEmail: data.signInEmail, signInPhone: data.signInPhone }, a._id);

    const emailChanged = 'signInEmail' in data && data.signInEmail !== a.signInEmail;
    const phoneChanged = 'signInPhone' in data && data.signInPhone !== a.signInPhone;
    const merged = {
      email: 'signInEmail' in data ? data.signInEmail : a.signInEmail,
      phone: 'signInPhone' in data ? data.signInPhone : a.signInPhone,
    };
    if (!merged.email && !merged.phone) throw new HttpError(400, 'identifier_required', 'An astrologer needs at least one sign-in e-mail or number.');

    const unlink = (emailChanged || phoneChanged) && a.uid;
    if (unlink) await svc.revokeRole(a); // the old account loses the role; the invite re-opens
    Object.assign(a, data);
    if (unlink) {
      a.uid = undefined;
      a.lastSignInAt = undefined;
      if (a.status === 'active') a.status = 'invited';
      a.presence = 'offline';
    }
    try {
      await a.save();
    } catch (e) {
      throw svc.isDup(e) ? svc.dupError() : e;
    }
    res.json({ astrologer: await svc.adminRow(a._id) });
  });

  admin.post('/admin/astrologers/:id/suspend', async (req, res) => {
    const a = await load(req.params.id);
    await Astrologer.updateOne({ _id: a._id }, { $set: { status: 'suspended', presence: 'offline' } });
    await svc.revokeRole(a);
    res.json({ astrologer: await svc.adminRow(a._id) });
  });

  admin.post('/admin/astrologers/:id/reactivate', async (req, res) => {
    const a = await load(req.params.id);
    await Astrologer.updateOne({ _id: a._id }, { $set: { status: a.uid ? 'active' : 'invited', presence: 'offline' } });
    if (a.uid) await ctx.identity.setRole(a.uid, 'astrologer');
    res.json({ astrologer: await svc.adminRow(a._id) });
  });

  admin.delete('/admin/astrologers/:id', async (req, res) => {
    const a = await load(req.params.id);
    await svc.revokeRole(a);
    await Astrologer.deleteOne({ _id: a._id });
    res.json({ ok: true }); // call history is kept; it carries the astrologer's name
  });

  /* ------------------------------------------------ identity -> calls -- */
  // The shapes of the monolith's `/internal/astrologers/claim` and `/active`, unchanged: `{ astrologer: { id, name } | null }`.
  const view = (a) => (a ? { id: String(a._id), name: a.name } : null);

  directory.post('/directory/astrologers/claim', async (req, res) => {
    const d = req.body?.decoded;
    if (!d || typeof d.uid !== 'string' || !d.uid) return res.status(400).json({ error: 'decoded.uid required', code: 'bad_request' });
    // Only what the claim reads; the identity service forwards verified token fields, nothing else is honoured.
    const decoded = {
      uid: d.uid,
      email: typeof d.email === 'string' ? d.email : undefined,
      email_verified: d.email_verified === true,
      phone_number: typeof d.phone_number === 'string' ? d.phone_number : undefined,
      firebase: { sign_in_provider: typeof d.firebase?.sign_in_provider === 'string' ? d.firebase.sign_in_provider : undefined },
    };
    res.json({ astrologer: view(await claimActiveAstrologer(decoded)) });
  });

  directory.get('/directory/astrologers/active', async (req, res) => {
    const uid = String(req.query.uid ?? '');
    if (!uid) return res.status(400).json({ error: 'uid required', code: 'bad_request' });
    res.json({ astrologer: view(await Astrologer.findOne({ uid, status: 'active' }).select('name').lean()) });
  });

  return { public: pub, devotee, admin, directory };
}
