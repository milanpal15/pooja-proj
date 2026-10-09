import type { Festival } from '@/constants/festivals';

import { monthLabel } from './dates';

/** Festivals (already in date order) grouped by month, each group keeping that order. */
export function groupByMonth(upcoming: Festival[], hi: boolean) {
  const out: { month: string; items: Festival[] }[] = [];
  for (const f of upcoming) {
    const label = monthLabel(f.date, hi);
    const last = out[out.length - 1];
    if (last && last.month === label) last.items.push(f);
    else out.push({ month: label, items: [f] });
  }
  return out;
}
