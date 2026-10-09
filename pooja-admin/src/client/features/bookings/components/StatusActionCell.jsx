import { useAccess } from '../../../lib/access/index.js';
import { Button } from '../../../ui/index.js';

/** The forward step for a row — rendered only for an account that may edit `orders`. */
export function StatusActionCell({ step, busy, name, onAdvance }) {
  const canEdit = useAccess().canEdit('orders');
  if (!canEdit || !step) return null;
  return (
    <Button size="sm" loading={busy} aria-label={`${step.label}: ${name}`} onClick={onAdvance}>
      {step.label}
    </Button>
  );
}
