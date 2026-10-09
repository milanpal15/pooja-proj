import { Badge } from '../../../ui/index.js';
import { presenceView } from '../lib/presence.js';

export function PresenceBadge({ astrologer }) {
  const v = presenceView(astrologer);
  return <Badge tone={v.tone}>{v.label}</Badge>;
}
