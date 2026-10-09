import { Badge } from '../../../ui/index.js';
import { formatDay } from '../../../lib/dates.js';
import { statusMeta } from '../lib/status.js';

/** The computed booking status as a word, with "Opens 25 Oct" for a scheduled one. */
export function StatusChip({ pooja }) {
  const m = statusMeta(pooja.status);
  const label = pooja.status === 'scheduled' && pooja.publishAt ? `Opens ${formatDay(pooja.publishAt)}` : m.label;
  return <Badge tone={m.tone}>{label}</Badge>;
}
