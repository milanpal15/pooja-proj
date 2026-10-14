import { asyncRouter } from '../../lib/async-handler.js';
import { Panchang } from './panchang.model.js';

/**
 * A temple's panchang override for one day, or null.
 *
 * Null is the normal answer: the device computes panchang itself and only
 * needs this when a temple publishes something different. Returning null
 * rather than 404 keeps the app's handling to one branch.
 */
export const panchang = asyncRouter();
panchang.get('/panchang', async (req, res) => {
  const date = String(req.query.date || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? String(req.query.date)
    : new Date().toISOString().slice(0, 10);

  const row = await Panchang.findOne({ date, enabled: true }).lean();
  if (!row) return res.json({ date, override: null });

  // Only the fields actually filled in travel; a blank must not blank out
  // what the device computed correctly.
  const keys = ['tithi','paksha','nakshatra','yoga','karana','masa','ritu','sunrise','sunset','rahuKaal','yamaganda','gulika','abhijit','note','noteHi'];
  const override = {};
  for (const k of keys) if (row[k]) override[k] = row[k];

  res.json({ date, override: Object.keys(override).length ? override : null });
});
