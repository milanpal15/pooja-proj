import mongoose from 'mongoose';

import { asyncRouter } from '../../lib/async-handler.js';
import { HttpError, httpErrorHandler } from '../../lib/http-error.js';
import { Astrologer } from '../astrologers/astrologer.model.js';
import { requireAstrologer } from '../astrologers/astrologer.guard.js';
import { Payout } from './payout.model.js';
import * as svc from './payout.service.js';

/**
 * Payout endpoints (contract §6) and the astrologer's own earnings (§4).
 * This system records payouts; it never moves bank money.
 */
export function payoutRouters({ requireAuth }) {
  const devotee = asyncRouter();
  const admin = asyncRouter();

  devotee.get('/astrologer/me/earnings', requireAuth, requireAstrologer, async (req, res) => {
    res.json(await svc.earningsFor(req.astrologer._id));
  });


  admin.get('/admin/payouts/summary', async (_req, res) => res.json({ astrologers: await svc.summary() }));

  admin.get('/admin/payouts', async (req, res) => {
    const q = {};
    if (req.query.astrologerId) {
      if (!mongoose.isValidObjectId(req.query.astrologerId)) return res.json({ payouts: [] });
      q.astrologerId = String(req.query.astrologerId);
    }
    const rows = await Payout.find(q).sort({ paidAt: -1 }).limit(200).lean();
    const names = new Map((await Astrologer.find({ _id: { $in: rows.map((r) => r.astrologerId) } }).select('name').lean()).map((a) => [String(a._id), a.name]));
    res.json({
      payouts: rows.map((p) => ({
        id: String(p._id),
        astrologerId: String(p.astrologerId),
        astrologerName: names.get(String(p.astrologerId)) ?? '',
        amountPaise: p.amountPaise,
        paidAt: p.paidAt,
        reference: p.reference,
        recordedBy: p.recordedBy,
      })),
    });
  });

  admin.post('/admin/payouts', async (req, res) => {
    const { astrologerId, amountPaise, reference } = req.body ?? {};
    if (!astrologerId) throw new HttpError(400, 'no_astrologer', 'Choose an astrologer.');
    const p = await svc.recordPayout({ astrologerId, amountPaise, reference, recordedBy: req.operator?.username });
    res.status(201).json({ payout: { id: String(p._id), astrologerId: String(p.astrologerId), amountPaise: p.amountPaise, paidAt: p.paidAt, reference: p.reference } });
  });

  devotee.use(httpErrorHandler);
  admin.use(httpErrorHandler);
  return { devotee, admin };
}
