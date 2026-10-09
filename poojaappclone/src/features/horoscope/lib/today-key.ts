/** `YYYY-MM-DD` in LOCAL time; `toISOString()` would shift the day. */
export function todayKey() {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}
