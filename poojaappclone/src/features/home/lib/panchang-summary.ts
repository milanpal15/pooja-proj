import type { Panchang } from '@/lib/panchang';

export type PanchangCell = { key: 'tithi' | 'nakshatra' | 'sun' | 'rahu'; value: string };

const two = (n: number) => String(n).padStart(2, '0');

/** 24-hour local time, as the design prints it ("06:14"). Null for a missing or invalid date. */
function hhmm(d: Date | null | undefined): string | null {
  return d && !Number.isNaN(d.getTime()) ? `${two(d.getHours())}:${two(d.getMinutes())}` : null;
}

type Source = Pick<Panchang, 'tithi' | 'tithiHi' | 'nakshatra' | 'nakshatraHi' | 'sunrise' | 'sunset' | 'rahuKaal'>;

/**
 * The four cells of the Home panchang card. A value that cannot be computed
 * (empty name, polar-day sunrise) is OMITTED — never a placeholder — so the
 * card shows fewer cells rather than wrong ones.
 */
export function summarisePanchang(p: Source, hi: boolean): PanchangCell[] {
  const cells: PanchangCell[] = [];
  const tithi = (hi ? p.tithiHi || p.tithi : p.tithi).trim();
  if (tithi) cells.push({ key: 'tithi', value: tithi });
  const nak = (hi ? p.nakshatraHi || p.nakshatra : p.nakshatra).trim();
  if (nak) cells.push({ key: 'nakshatra', value: nak });
  const rise = hhmm(p.sunrise);
  const set = hhmm(p.sunset);
  if (rise && set) cells.push({ key: 'sun', value: `${rise} · ${set}` });
  const rs = hhmm(p.rahuKaal?.start);
  const re = hhmm(p.rahuKaal?.end);
  if (rs && re) cells.push({ key: 'rahu', value: `${rs} – ${re}` });
  return cells;
}
