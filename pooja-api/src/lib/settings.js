import { engagementEnabled, getSettingsMap } from './engagement-client.js';
import { Setting } from '../models.js';

/**
 * Typed reads of the dashboard's key/value Settings table.
 *
 * `Setting.value` is a string, so each caller used to coerce its own. These
 * return the fallback when the key is missing or unparseable, so a fresh
 * database behaves exactly like the defaults written in code.
 *
 * With ENGAGEMENT_URL set the table lives in the engagement service: reads go through the cached,
 * never-throwing engagement client (so an outage degrades to the caller's fallback), and the seed helper
 * is a no-op because engagement seeds the same defaults itself.
 */
export async function getSetting(key, fallback = '') {
  if (engagementEnabled()) return (await getSettingsMap())[key] ?? fallback;
  const row = await Setting.findOne({ key }).lean();
  return row?.value ?? fallback;
}

export async function getNumberSetting(key, fallback) {
  const raw = String(await getSetting(key, '')).trim();
  const n = Number(raw);
  return raw !== '' && Number.isFinite(n) ? n : fallback;
}

export async function getBoolSetting(key, fallback) {
  const v = String(await getSetting(key, '')).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

/** Create a setting only if absent — seeds must never overwrite an operator's edit. */
export async function ensureSetting(key, value, label, desc) {
  if (engagementEnabled()) return; // engagement seeds these (services/engagement/src/defaults.js)
  await Setting.updateOne(
    { key },
    { $setOnInsert: { key, value: String(value), label, desc } },
    { upsert: true },
  );
}
