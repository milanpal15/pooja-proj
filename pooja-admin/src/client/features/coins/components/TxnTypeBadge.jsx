import { Badge } from '../../../ui/index.js';
import { txnType } from '../lib/packs.js';

export function TxnTypeBadge({ type }) {
  const t = txnType(type);
  return <Badge tone={t.tone}>{t.label}</Badge>;
}
