/** The Hindi twin when the devotee reads Hindi and it is filled in, else the English field. */
export function pick(hi: boolean, en: string | undefined, hiText: string | undefined): string {
  const h = (hiText ?? '').trim();
  return hi && h ? h : (en ?? '');
}
