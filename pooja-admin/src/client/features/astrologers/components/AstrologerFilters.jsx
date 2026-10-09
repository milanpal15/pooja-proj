import { Field } from '../../../ui/index.js';

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'suspended', label: 'Suspended' },
];

export function AstrologerFilters({ value, onChange, specialities }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  return (
    <div className="feat-toolbar">
      <Field hideLabel label="Search" type="search" className="ui-field--grow" placeholder="Search name or speciality" value={value.q} onChange={set('q')} />
      <Field hideLabel label="Status filter" type="select" className="ui-field--auto" value={value.status} onChange={set('status')} options={STATUSES} />
      <Field
        hideLabel
        label="Speciality filter"
        type="select"
        className="ui-field--auto"
        value={value.speciality}
        onChange={set('speciality')}
        options={[{ value: '', label: 'All specialities' }, ...specialities.map((s) => ({ value: s, label: s }))]}
      />
    </div>
  );
}
