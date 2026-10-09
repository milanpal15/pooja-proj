import { asyncRouter } from '../../lib/async-handler.js';
import { Horoscope } from './horoscope.model.js';

/** The twelve signs, in the traditional order. Also the bulk editor's shape. */
export const RASHIS = [
  'mesha', 'vrishabha', 'mithuna', 'karka', 'simha', 'kanya',
  'tula', 'vrischika', 'dhanu', 'makara', 'kumbha', 'meena',
];


/**
 * Today's readings, or a given day's.
 *
 * Its own endpoint rather than part of `/api/content`: horoscopes are one
 * row per sign per day, so bundling them into the content payload would
 * grow it without bound and ship 11 signs nobody asked for on every launch.
 *
 * Returns whatever exists. An empty array is a real answer — the app says
 * nothing is published rather than inventing a reading.
 */
export const horoscope = asyncRouter();

/**
 * Every sign for one day, read and written in a single call.
 *
 * Horoscopes are twelve rows a day, and entering them one modal at a time is
 * twelve open-type-save cycles for something that is really one editorial
 * act. The dashboard's day editor uses this pair.
 *
 * The write upserts on (rashi, date), so re-publishing a day corrects it
 * rather than colliding with the unique index. A sign left blank is deleted
 * rather than stored empty, which keeps "no reading published" meaning
 * exactly that in the app.
 */
horoscope.get('/horoscope/day/:date', async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'bad date' });

  const rows = await Horoscope.find({ date }).lean();
  const byRashi = Object.fromEntries(rows.map((r) => [r.rashi, r]));
  res.json({
    date,
    readings: RASHIS.map((rashi) => ({
      rashi,
      prediction: byRashi[rashi]?.prediction ?? '',
      predictionHi: byRashi[rashi]?.predictionHi ?? '',
      luckyColor: byRashi[rashi]?.luckyColor ?? '',
      luckyColorHi: byRashi[rashi]?.luckyColorHi ?? '',
      luckyNumber: byRashi[rashi]?.luckyNumber ?? '',
      enabled: byRashi[rashi]?.enabled ?? true,
    })),
  });
});

horoscope.put('/horoscope/day/:date', async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'bad date' });

  const incoming = Array.isArray(req.body?.readings) ? req.body.readings : [];
  let saved = 0;
  let removed = 0;

  for (const r of incoming) {
    if (!RASHIS.includes(r.rashi)) continue;
    const text = String(r.prediction ?? '').trim();
    const textHi = String(r.predictionHi ?? '').trim();

    // Nothing written for this sign — drop any previous row for the day.
    if (!text && !textHi) {
      const { deletedCount } = await Horoscope.deleteOne({ rashi: r.rashi, date });
      removed += deletedCount ?? 0;
      continue;
    }

    await Horoscope.updateOne(
      { rashi: r.rashi, date },
      {
        $set: {
          prediction: text,
          predictionHi: textHi,
          luckyColor: String(r.luckyColor ?? '').trim(),
          luckyColorHi: String(r.luckyColorHi ?? '').trim(),
          luckyNumber: String(r.luckyNumber ?? '').trim(),
          enabled: r.enabled !== false,
        },
      },
      { upsert: true },
    );
    saved += 1;
  }

  res.json({ date, saved, removed });
});
horoscope.get('/horoscope', async (req, res) => {
  const date = String(req.query.date || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? String(req.query.date)
    : new Date().toISOString().slice(0, 10);

  const rows = await Horoscope.find({ date, enabled: true }).lean();
  res.json({
    date,
    readings: rows.map((r) => ({
      rashi: r.rashi,
      prediction: r.prediction ?? '',
      predictionHi: r.predictionHi ?? '',
      luckyColor: r.luckyColor ?? '',
      luckyColorHi: r.luckyColorHi ?? '',
      luckyNumber: r.luckyNumber ?? '',
    })),
  });
});
