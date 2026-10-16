export const MAX_RECENTS = 8;

/** Put `query` first, drop an earlier copy (ignoring case / spacing), cap the list. Blank queries are ignored. */
export function addRecent(list: readonly string[], query: string, max: number = MAX_RECENTS): string[] {
  const q = (query ?? '').trim().replace(/\s+/g, ' ');
  if (!q) return list.slice(0, max);
  const key = q.toLowerCase();
  return [q, ...list.filter((r) => r.toLowerCase() !== key)].slice(0, max);
}

export function removeRecent(list: readonly string[], query: string): string[] {
  return list.filter((r) => r !== query);
}

/** Read whatever came out of storage; anything that is not a list of strings is an empty history. */
export function parseRecents(raw: string | null | undefined, max: number = MAX_RECENTS): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, max);
  } catch {
    return [];
  }
}
