import { Setting } from '../models.js';

/**
 * Typed reads of the dashboard's key/value Settings table.
 *
 * `Setting.value` is a string, so each caller used to coerce its own. These
 * return the fallback when the key is missing or unparseable, so a fresh
 * database behaves exactly like the defaults written in code.
 */
export async function getSetting(key, fallback = '') {
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
  await Setting.updateOne(
    { key },
    { $setOnInsert: { key, value: String(value), label, desc } },
    { upsert: true },
  );
}
