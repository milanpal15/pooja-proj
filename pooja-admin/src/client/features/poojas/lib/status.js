/** The API computes a pooja's status from its booking window (docs/POOJA_AND_HOME.md §2.2). */
export const STATUSES = [
  { value: 'live', label: 'Live', tone: 'success' },
  { value: 'closing', label: 'Closing soon', tone: 'warning' },
  { value: 'scheduled', label: 'Scheduled', tone: 'info' },
  { value: 'draft', label: 'Draft', tone: 'neutral' },
  { value: 'ended', label: 'Ended', tone: 'outline' },
];

export const statusMeta = (status) => STATUSES.find((s) => s.value === status) || { value: status, label: status || '—', tone: 'neutral' };
