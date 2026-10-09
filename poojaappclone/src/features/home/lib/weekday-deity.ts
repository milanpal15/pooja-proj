/**
 * The deity each weekday is traditionally kept for (0 = Sunday), by dashboard
 * slug. Used only to choose WHOSE darshan the Home card opens with; if the
 * dashboard has no such deity the first one it does have is used instead.
 */
const BY_WEEKDAY = ['krishna', 'shiva', 'hanuman', 'ganesh', 'vishnu', 'lakshmi', 'shani'];

export function deityForWeekday<T extends { id: string }>(deities: T[], weekday: number): T | undefined {
  const slug = BY_WEEKDAY[((weekday % 7) + 7) % 7];
  return deities.find((d) => d.id === slug) ?? deities[0];
}
