/**
 * The one place money is formatted.
 *
 * Rupee amounts travel as integer paise (`…Paise`); coins are integers. Never
 * format either inline — a stray `toFixed(2)` is how ₹20 turns into "20.0".
 */
const NA = '—';

/** 2000 -> "₹20", 2050 -> "₹20.50". Whole rupees drop the decimals. */
export function formatInr(paise) {
  if (paise === null || paise === undefined || Number.isNaN(Number(paise))) return NA;
  const n = Number(paise);
  const whole = n % 100 === 0;
  return `₹${(n / 100).toLocaleString('en-IN', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** A whole-rupee price as the API sends CoinPack.price. */
export const formatRupees = (rupees) =>
  rupees === null || rupees === undefined ? NA : formatInr(Math.round(Number(rupees) * 100));

/** 1400 -> "1,400". */
export function formatCoins(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return NA;
  return Number(n).toLocaleString('en-IN');
}

/** +50 / −100, with a real minus sign so it lines up and reads as one. */
export function formatSignedCoins(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return NA;
  const v = Number(n);
  if (v === 0) return '0';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toLocaleString('en-IN')}`;
}

/** Rupees as typed (may be "12.5") -> integer paise, or null if not a number. */
export function rupeesToPaise(text) {
  const v = Number(String(text).replace(/[₹,\s]/g, ''));
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}
