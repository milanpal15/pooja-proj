/** 25000 → "25k" / "25 हज़ार". Keeps long counts from wrapping the row. */
export function formatCount(n: number, lang: 'en' | 'hi') {
  if (n < 1000) return String(n);
  const k = n / 1000;
  const label = k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, '');
  return lang === 'hi' ? `${label} हज़ार` : `${label}k`;
}
