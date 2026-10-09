import { Field } from '../../../ui/index.js';
import { STATUSES } from '../lib/status.js';

/** Search plus status / temple / festival filters. */
export function PoojaFilters({ filters, temples, festivals, onChange }) {
  return (
    <div className="feat-toolbar feat-toolbar--bare">
      <Field hideLabel label="Search poojas" type="search" className="ui-field--grow" placeholder="Search by title, temple or festival" value={filters.q} onChange={(v) => onChange('q', v)} />
      <Field hideLabel label="Status" type="select" className="ui-field--auto" value={filters.status} onChange={(v) => onChange('status', v)} options={[{ value: '', label: 'Status: All' }, ...STATUSES]} />
      <Field hideLabel label="Temple" type="select" className="ui-field--auto" value={filters.temple} onChange={(v) => onChange('temple', v)} options={temples.map((o) => (o.value ? o : { value: '', label: 'Temple: All' }))} />
      <Field hideLabel label="Festival" type="select" className="ui-field--auto" value={filters.festival} onChange={(v) => onChange('festival', v)} options={festivals.map((o) => (o.value ? o : { value: '', label: 'Festival: All' }))} />
    </div>
  );
}
