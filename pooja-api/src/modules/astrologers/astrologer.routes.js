import { redactAstrologerRows } from '../../access/redact.js';
import { asyncRouter } from '../../lib/async-handler.js';
import { HttpError, httpErrorHandler } from '../../lib/http-error.js';
import { getNumberSetting } from '../../lib/settings.js';
import { User } from '../../models.js';
import { CallSession } from '../calls/call.model.js';
import { AstrologerEarning } from '../payouts/payout.model.js';
import * as callService from '../calls/call.service.js';
import { requireAstrologer } from './astrologer.guard.js';
import { Astrologer, effectivePresence } from './astrologer.model.js';
import * as svc from './astrologer.service.js';

/**
 * Astrologer endpoints (contract §4).
 *
 *   public    GET  /astrologers, /astrologers/:id          (listed + active only)
 *   devotee   /astrologer/me/*                             (token + active-astrologer check)
 *   admin     /admin/astrologers CRUD, suspend, reactivate (area `astrologers`; sign-in identifiers masked without astrologers:edit)
 *
 * `/astrologer/me/earnings` is served by the payouts module.
 */
export function astrologerRouters({ requireAuth }) {
  const pub = asyncRouter();
  const devotee = asyncRouter();
  const admin = asyncRouter();

  pub.get('/astrologers', async (_req, res) => res.json({ astrologers: await svc.listPublic() }));
  pub.get('/astrologers/:id', async (req, res) => res.json({ astrologer: await svc.getPublic(req.params.id) }));

  /* ------------------------------------------------ astrologer's own side -- */
  const me = [requireAuth, requireAstrologer];

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
      const next = await Astrologer.findOneAndUpdate(
        { _id: a._id, status: 'active' },
        [{ $set: { lastSeenAt: '$$NOW', presence: { $cond: [{ $eq: ['$presence', 'busy'] }, 'busy', 'online'] } } }],
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
    await Astrologer.updateOne({ _id: req.astrologer._id }, { $set: { lastSeenAt: new Date() } });
    res.json({ ok: true });
  });

  devotee.get('/astrologer/me/incoming', ...me, async (req, res) => {
    const ringMs = (await getNumberSetting('ringTimeoutSec', 25)) * 1000;
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
  admin.get('/admin/astrologers', async (req, res) => res.json({ astrologers: redactAstrologerRows(await svc.adminRows(), req) }));

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
    if (a.uid) await User.updateOne({ uid: a.uid }, { $set: { role: 'astrologer' } });
    res.json({ astrologer: await svc.adminRow(a._id) });
  });

  admin.delete('/admin/astrologers/:id', async (req, res) => {
    const a = await load(req.params.id);
    await svc.revokeRole(a);
    await Astrologer.deleteOne({ _id: a._id });
    res.json({ ok: true }); // call history is kept; it carries the astrologer's name
  });

  pub.use(httpErrorHandler);
  devotee.use(httpErrorHandler);
  admin.use(httpErrorHandler);
  return { public: pub, devotee, admin };
}
