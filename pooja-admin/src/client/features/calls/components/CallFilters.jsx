import { Button, Field } from '../../../ui/index.js';
import { OUTCOME_FILTERS } from '../lib/outcome.js';

/** Date range + outcome + CSV, in the call log's header. */
export function CallFilters({ value, onChange, onExport, canExport }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  return (
    <>
      <Field hideLabel label="From date" type="date" className="ui-field--auto" value={value.from} onChange={set('from')} />
      <Field hideLabel label="To date" type="date" className="ui-field--auto" value={value.to} onChange={set('to')} />
      <Field hideLabel label="Outcome" type="select" className="ui-field--auto" value={value.outcome} onChange={set('outcome')} options={OUTCOME_FILTERS} />
      <Button variant="secondary" onClick={onExport} disabled={!canExport}>
        Export CSV
      </Button>
    </>
  );
}
