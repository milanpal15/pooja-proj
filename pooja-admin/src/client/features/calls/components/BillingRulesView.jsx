import { Card, ErrorState, ReadOnlyBadge, ReadOnlyList, StatusText, TableSkeleton } from '../../../ui/index.js';
import { CALL_RULES, OTHER_RULES, rulesToForm } from '../lib/rules.js';

/** The billing rules for an account without `money:edit`: the same values, as text. */
export function BillingRulesView({ rules, status, error, offline, onRetry }) {
  const form = rules ? rulesToForm(rules) : null;
  const row = (f) => ({ label: f.label, value: form[f.key] });
  return (
    <Card title="Billing rules" actions={<ReadOnlyBadge />}>
      {status === 'loading' && <TableSkeleton rows={4} />}
      {status === 'error' && <ErrorState message={error} offline={offline} onRetry={onRetry} />}
      {form && (
        <ReadOnlyList
          label="Billing rules"
          rows={[
            ...CALL_RULES.map(row),
            { label: 'Astrologer calls enabled in the app', value: <StatusText on={!!form.callsEnabled} onLabel="Enabled" offLabel="Disabled" /> },
            ...OTHER_RULES.map(row),
          ]}
        />
      )}
    </Card>
  );
}
