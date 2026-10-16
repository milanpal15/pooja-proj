/**
 * The last-point store behind the `location` task kind (docs/EVENTS.md section 11.2): one row per (event, devotee), overwritten on
 * every report, expiring 7 days after the event ends. It doubles as the per-devotee report slot (one report per 5 s).
 */
import { effectiveEnd } from '../events/status.js';
import { LocationPoint } from '../models/index.js';

export const MIN_REPORT_INTERVAL_MS = 5000;
const WEEK_MS = 7 * 24 * 3600_000;

/** Event end + 7 days; an event with no end keeps the row 7 days from the report. */
export const expiryOf = (event, t) => new Date((effectiveEnd(event?.schedule) ?? t.getTime()) + WEEK_MS);

/**
 * Takes the devotee's report slot. Atomic: the upsert only matches a row whose last slot is older than 5 s, otherwise it tries to
 * insert and the unique index refuses, so parallel reports let exactly one through.
 * @returns {Promise<{ limited: boolean, prev?: { lat: number, lng: number, atMs: number } | null }>}
 */
export async function claimSlot({ uid, event, t }) {
  try {
    const prev = await LocationPoint.findOneAndUpdate(
      { uid, eventSlug: event.slug, reportedAt: { $lte: new Date(t.getTime() - MIN_REPORT_INTERVAL_MS) } },
      { $set: { reportedAt: t, expiresAt: expiryOf(event, t) } },
      { upsert: true, new: false, lean: true },
    );
    return { limited: false, prev: prev && Number.isFinite(prev.lat) && Number.isFinite(prev.lng) && prev.pointAt ? { lat: prev.lat, lng: prev.lng, atMs: new Date(prev.pointAt).getTime() } : null };
  } catch (e) {
    if (e?.code === 11000) return { limited: true };
    throw e;
  }
}

/** Overwrites the last point (the only thing kept). */
export const savePoint = ({ uid, event, t, lat, lng }) =>
  LocationPoint.updateOne({ uid, eventSlug: event.slug }, { $set: { lat, lng, pointAt: t, expiresAt: expiryOf(event, t) }, $setOnInsert: { reportedAt: t } }, { upsert: true });
