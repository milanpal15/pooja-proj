import { useLanguage } from '@/i18n';
import type { Coords } from '@/lib/geo';

import { summarisePanchang, type PanchangCell } from '../lib/panchang-summary';
import { useHomePanchang } from './use-home-panchang';

export type PanchangView = { cells: PanchangCell[]; line: string };

/**
 * Today's panchang as the Home cards draw it: the summary cells and the
 * "॥ vara, masa, tithi ॥" line. Computed on-device, so it works offline; null
 * when nothing could be computed (the card is then omitted).
 */
export function usePanchangView(here: Coords | null): PanchangView | null {
  const { lang } = useLanguage();
  const hi = lang === 'hi';
  const p = useHomePanchang(here);
  if (!p) return null;
  const cells = summarisePanchang(p, hi);
  const line = `॥ ${[hi ? p.varaHi : p.vara, hi ? p.masaHi : p.masa, hi ? p.tithiHi : p.tithi].filter(Boolean).join(', ')} ॥`;
  return { cells, line };
}
