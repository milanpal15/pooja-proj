/** `YYYY-MM-DD` in LOCAL time; `toISOString()` would shift the day. */
export function dayKey(d: Date) {
  const z = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
