import { formatCoins } from '@/lib/format';

/** Paise -> "₹1,24,500" (whole rupees) or "₹1,245.50" when there are paise. */
export function formatRupeesFromPaise(paise: number): string {
  const p = Math.round(Number.isFinite(paise) ? paise : 0);
  const rupees = Math.trunc(p / 100);
  const rest = Math.abs(p % 100);
  const sign = p < 0 && rupees === 0 ? '-' : '';
  return `₹${sign}${formatCoins(rupees)}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

/** "Priya Sharma" -> "Priya S." — enough to recognise, not the full name. */
export function shortName(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  return w.length === 1 ? w[0] : `${w[0]} ${Array.from(w[w.length - 1])[0]}.`;
}

export function isSameDay(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
