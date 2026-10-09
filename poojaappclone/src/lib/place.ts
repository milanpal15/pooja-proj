/**
 * "Temple, place" as one line, without printing the temple twice.
 * A pooja's `place` often already starts with its temple ("Kashi Vishwanath,
 * Varanasi"), so naively joining the two reads "Kashi Vishwanath, Kashi
 * Vishwanath, Varanasi".
 */
export function placeLine(templeName?: string | null, place?: string | null): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [templeName ?? '', ...(place ?? '').split(',')]) {
    const part = raw.trim();
    const key = part.toLowerCase();
    if (!part || seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out.join(', ');
}
