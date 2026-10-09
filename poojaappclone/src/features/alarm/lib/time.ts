export function parseTime(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return { hour: Number.isFinite(h) ? h : 0, minute: Number.isFinite(m) ? m : 0 };
}

export function formatTime(hour: number, minute: number, hi = false): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? (hi ? 'पूर्वाह्न' : 'AM') : hi ? 'अपराह्न' : 'PM';
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
}
