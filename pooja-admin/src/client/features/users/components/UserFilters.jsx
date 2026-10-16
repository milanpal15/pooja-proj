import { Button, Field } from '../../../ui/index.js';
import { LAST_ACTIVE_PRESETS, ROLE_OPTIONS, SORTS, STATUS_OPTIONS, activeFilterCount, dateRangeError } from '../lib/query.js';

/** Status · Tag · Role · App version · Last active · Created, and the sort. Every control is applied at once. */
export function UserFilters({ filters, onChange, sort, onSort, onClear, tagHints = [] }) {
  const set = (k) => (v) => onChange({ ...filters, [k]: v });
  const n = activeFilterCount(filters);
  const rangeErr = dateRangeError(filters);
  return (
    <div className="usr-filters" role="group" aria-label="Filters">
      <Field label="Status" type="select" value={filters.status} onChange={set('status')} options={STATUS_OPTIONS} />
      <Field label="Tag" value={filters.tag} onChange={set('tag')} placeholder="e.g. vip" list="usr-tag-hints" autoComplete="off" />
      <datalist id="usr-tag-hints">
        {tagHints.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <Field label="Role" type="select" value={filters.role} onChange={set('role')} options={ROLE_OPTIONS} />
      <Field label="App version (build)" value={filters.versionCode} onChange={set('versionCode')} placeholder="e.g. 13" inputMode="numeric" />
      <Field label="Last active" type="select" value={filters.lastActive} onChange={set('lastActive')} options={LAST_ACTIVE_PRESETS} />
      <Field label="Created from" type="date" value={filters.createdFrom} onChange={set('createdFrom')} error={rangeErr} />
      <Field label="Created to" type="date" value={filters.createdTo} onChange={set('createdTo')} />
      <Field label="Sort by" type="select" value={sort.sort} onChange={(v) => onSort({ ...sort, sort: v })} options={SORTS} />
      <Field
        label="Order"
        type="select"
        value={sort.dir}
        onChange={(v) => onSort({ ...sort, dir: v })}
        options={[
          { value: 'desc', label: sort.sort === 'name' ? 'Z to A' : 'Newest first' },
          { value: 'asc', label: sort.sort === 'name' ? 'A to Z' : 'Oldest first' },
        ]}
      />
      {n > 0 && (
        <div className="usr-filters__clear">
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear {n} {n === 1 ? 'filter' : 'filters'}
          </Button>
        </div>
      )}
    </div>
  );
}
