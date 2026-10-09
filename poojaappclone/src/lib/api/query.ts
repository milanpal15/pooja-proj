/** `?a=1&b=x` from a params object, skipping empty values. Empty string when none. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v).trim())}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
