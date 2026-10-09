import { Badge } from '../../../ui/index.js';
import { outcomeView } from '../lib/outcome.js';

export function OutcomeBadge({ call }) {
  const v = outcomeView(call);
  return <Badge tone={v.tone}>{v.label}</Badge>;
}
