import { redactCallRow } from '../../access/redact.js';
import { asyncRouter } from '../../lib/async-handler.js';
import { HttpError, httpErrorHandler } from '../../lib/http-error.js';
import { CallSession } from './call.model.js';
import * as calls from './call.service.js';
import { requireAstrologer } from '../astrologers/astrologer.guard.js';

/**
 * Call endpoints (contract §5). Devotee and astrologer routes both live in the
 * `devotee` router because both verify a Firebase token; the astrologer-only
 * ones add `requireAstrologer`, which re-checks the role in the database.
 */
export function callRouters({ requireAuth }) {
  const devotee = asyncRouter();
  const admin = asyncRouter();

  devotee.post('/calls', requireAuth, async (req, res) => {
    const { astrologerId, requestId } = req.body ?? {};
    const call = await calls.requestCall({ devoteeUid: req.token.uid, astrologerId, requestId });
    res.status(201).json({ call: await calls.toView(call, { viewerUid: req.token.uid }) });
  });

  /** Both parties poll this; each poll also counts as "still here" for silence detection. */
  devotee.get('/calls/:id', requireAuth, async (req, res) => {
    const call = await calls.loadForParticipant(req.params.id, req.token.uid);
    if (call.status === 'connected') {
      const field = call.devoteeUid === req.token.uid ? 'devoteeSeenAt' : 'astrologerSeenAt';
      await CallSession.updateOne({ _id: call._id }, { $set: { [field]: new Date() } });
    }
    res.json({ call: await calls.toView(call, { viewerUid: req.token.uid }) });
  });

  devotee.post('/calls/:id/cancel', requireAuth, async (req, res) => {
    const call = await calls.loadForParticipant(req.params.id, req.token.uid);
    if (call.devoteeUid !== req.token.uid) throw new HttpError(403, 'not_your_call', 'Only the caller can cancel.');
    res.json({ call: await calls.toView(await calls.cancelCall(call), { viewerUid: req.token.uid }) });
  });

  devotee.post('/calls/:id/end', requireAuth, async (req, res) => {
    const call = await calls.loadForParticipant(req.params.id, req.token.uid);
    res.json({ call: await calls.toView(await calls.endCall(call, req.token.uid), { viewerUid: req.token.uid }) });
  });

  devotee.post('/calls/:id/accept', requireAuth, requireAstrologer, async (req, res) => {
    const call = await calls.loadForParticipant(req.params.id, req.token.uid);
    if (call.astrologerUid !== req.token.uid) throw new HttpError(403, 'not_your_call', 'This call is for another astrologer.');
    res.json({ call: await calls.toView(await calls.acceptCall(call), { viewerUid: req.token.uid }) });
  });

  devotee.post('/calls/:id/decline', requireAuth, requireAstrologer, async (req, res) => {
    const call = await calls.loadForParticipant(req.params.id, req.token.uid);
    if (call.astrologerUid !== req.token.uid) throw new HttpError(403, 'not_your_call', 'This call is for another astrologer.');
    res.json({ call: await calls.toView(await calls.declineCall(call), { viewerUid: req.token.uid }) });
  });

  devotee.post('/calls/:id/rating', requireAuth, async (req, res) => {
    const call = await calls.loadForParticipant(req.params.id, req.token.uid);
    if (call.devoteeUid !== req.token.uid) throw new HttpError(403, 'not_your_call', 'Only the caller can rate.');
    const rated = await calls.rateCall(call, req.body?.rating);
    res.json({ call: await calls.toView(rated, { viewerUid: req.token.uid }) });
  });

  admin.get('/admin/calls', async (req, res) => {
    const q = {};
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    if (from && !Number.isNaN(+from)) q.requestedAt = { ...q.requestedAt, $gte: from };
    if (to && !Number.isNaN(+to)) q.requestedAt = { ...q.requestedAt, $lte: to };
    const outcome = String(req.query.outcome ?? '').trim();
    if (outcome) q.$or = [{ endReason: outcome }, { status: outcome }];
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const [rows, live] = await Promise.all([
      CallSession.find(q).sort({ requestedAt: -1 }).limit(limit).lean(),
      CallSession.find({ status: { $in: ['requested', 'connected'] } }).sort({ requestedAt: -1 }).limit(100).lean(),
    ]);
    const row = (c) => redactCallRow(calls.toRow(c), c, req);
    res.json({ calls: rows.map(row), live: live.map(row) });
  });

  admin.post('/admin/calls/:id/end', async (req, res) => {
    if (!(await CallSession.exists({ _id: req.params.id }).catch(() => null))) throw new HttpError(404, 'call_not_found', 'Call not found.');
    const ended = await calls.adminEnd(req.params.id);
    res.json({ call: redactCallRow(calls.toRow(ended), ended, req) });
  });

  admin.post('/admin/calls/:id/refund', async (req, res) => {
    const { coins, reason, requestId } = req.body ?? {};
    const out = await calls.goodwillRefund(req.params.id, { coins, reason, requestId, operator: req.operator?.username });
    res.json({ ok: true, balance: out.balance, call: redactCallRow(calls.toRow(out.call), out.call, req) });
  });

  devotee.use(httpErrorHandler);
  admin.use(httpErrorHandler);
  return { devotee, admin };
}
