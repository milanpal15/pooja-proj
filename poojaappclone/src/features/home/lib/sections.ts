import type { RemoteHomeItem } from '@/providers/content';

/** Hide an item only when its flag is KNOWN to be off — an unknown key (offline) stays. */
export function visibleItems(items: RemoteHomeItem[], flags: Record<string, boolean>): RemoteHomeItem[] {
  return items.filter((i) => !i.flag || flags[i.flag] !== false);
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
