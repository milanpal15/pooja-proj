/**
 * The telemetry headers sent to OUR API on every call (docs/RELEASES.md §1). Pure so it can be tested
 * without React Native; `app-info.ts` supplies the real values.
 */
export type AppInfo = {
  platform: string;
  versionName: string;
  /** `expo.android.versionCode`; null when the build has none (then the header is omitted). */
  versionCode: number | null;
  /** Android API level; null off Android. */
  osApi: number | null;
  deviceId: string | null;
};

const validInt = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Only headers with a real value are included: an absent code must read as "unidentified", never "0". */
export function buildAppHeaders(info: AppInfo): Record<string, string> {
  const h: Record<string, string> = {};
  if (info.platform) h['X-App-Platform'] = info.platform;
  if (info.versionName) h['X-App-Version'] = info.versionName;
  if (validInt(info.versionCode)) h['X-App-Version-Code'] = String(Math.trunc(info.versionCode));
  if (validInt(info.osApi)) h['X-OS-Api'] = String(Math.trunc(info.osApi));
  // Header values must be printable ASCII; the id is ours (`dev_…`) but a corrupt store must not break fetch.
  if (info.deviceId && /^[\x20-\x7e]{1,128}$/.test(info.deviceId)) h['X-Device-Id'] = info.deviceId;
  return h;
}
