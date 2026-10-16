import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../lib/api/index.js';
import { KNOWN_AREAS } from '../../lib/access/areas.js';
import { downloadCsv, toCsv } from '../../lib/csv.js';
import { Button, Card, DataTable, EmptyState, ErrorState, Field, TableSkeleton, useToast } from '../../ui/index.js';
import { AuditRows } from './components/AuditRow.jsx';
import { CSV_COLUMNS, METHODS, NO_FILTERS, buildParams, csvName, hasFilters, rangeError } from './lib/audit.js';

const roleName = (r) => r;

/**
 * Audit log (area `audit`, admin by default): who changed what, newest first. Filters apply as you type (operator is
 * debounced); paging is by cursor, one page at a time with Newer / Older; a row opens its before → after; "Export CSV"
 * writes exactly the rows on screen.
 */
export function AuditPage() {
  const toast = useToast();
  const [filters, setFilters] = useState(NO_FILTERS);
  const [applied, setApplied] = useState(NO_FILTERS);
  const [cursors, setCursors] = useState([null]); // cursor used for each page shown so far
  const [state, setState] = useState({ status: 'loading', items: [], next: null, error: '' });
  const [open, setOpen] = useState(null);
  const seq = useRef(0);
  const err = rangeError(filters);

  // The operator box is debounced; selects and dates apply at once.
  useEffect(() => {
    const t = setTimeout(() => !err && setApplied((a) => (JSON.stringify(a) === JSON.stringify(filters) ? a : filters)), filters.operator !== applied.operator ? 350 : 0);
    return () => clearTimeout(t);
  }, [filters, err]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setCursors([null]), [applied]);

  const cursor = cursors[cursors.length - 1];
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setState((s) => ({ ...s, status: s.items.length ? 'loading-more' : 'loading' }));
    try {
      const r = await api.auditPage(buildParams(applied, cursor));
      if (mine === seq.current) setState({ status: 'ready', items: r.items, next: r.next, error: '' });
    } catch (e) {
      if (mine === seq.current) setState({ status: 'error', items: [], next: null, error: e.message, offline: e.offline });
    }
  }, [applied, cursor]);
  useEffect(() => {
    setOpen(null);
    load();
  }, [load]);

  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
  const page = cursors.length;

  return (
    <div className="ui-page">
      <Card flush title="Audit log" description="Every change an operator makes, newest first. Version-policy, release, approval and role changes keep their before and after."
        actions={<Button variant="outline" disabled={!state.items.length} onClick={() => { downloadCsv(csvName(), toCsv(CSV_COLUMNS, state.items)); toast.success(`Exported ${state.items.length} rows`, { detail: 'Only the rows on this page.' }); }}>Export CSV</Button>}>
        <form className="audit__filters" onSubmit={(e) => e.preventDefault()} aria-label="Filters">
          <Field label="Operator" value={filters.operator} onChange={set('operator')} placeholder="username" type="search" />
          <Field label="Area" type="select" value={filters.area} onChange={set('area')} options={[{ value: '', label: 'Any area' }, ...KNOWN_AREAS.map((a) => ({ value: a.key, label: a.label }))]} />
          <Field label="Method" type="select" value={filters.method} onChange={set('method')} options={[{ value: '', label: 'Any' }, ...METHODS.map((m) => ({ value: m, label: m }))]} />
          <Field label="From" type="date" value={filters.from} onChange={set('from')} />
          <Field label="To" type="date" value={filters.to} onChange={set('to')} error={err} />
          {hasFilters(filters) && <Button variant="ghost" onClick={() => { setFilters(NO_FILTERS); setApplied(NO_FILTERS); }}>Clear</Button>}
        </form>
        {state.status === 'loading' && <TableSkeleton rows={5} />}
        {state.status === 'error' && <ErrorState message={state.error} offline={state.offline} onRetry={load} />}
        {(state.status === 'ready' || state.status === 'loading-more') && state.items.length === 0 && (
          <EmptyState title={hasFilters(applied) ? 'Nothing matches these filters' : 'Nothing recorded yet'}>{hasFilters(applied) ? 'Widen the dates or clear a filter.' : 'Every change an operator makes appears here.'}</EmptyState>
        )}
        {state.items.length > 0 && (
          <DataTable label="Audit log entries" minWidth={820} className="audit__table">
            <thead>
              <tr><th>When</th><th>Operator</th><th>What</th><th>Area</th><th>Result</th><th aria-label="Details" /></tr>
            </thead>
            <tbody>
              {state.items.map((e, i) => (
                <AuditRows key={e.id ?? `${e.at}-${i}`} e={{ ...e, id: e.id ?? i }} open={open === (e.id ?? i)} onToggle={() => setOpen(open === (e.id ?? i) ? null : e.id ?? i)} labelOf={roleName} />
              ))}
            </tbody>
          </DataTable>
        )}
        {state.items.length > 0 && (
          <div className="audit__pager" role="navigation" aria-label="Pages">
            <Button variant="outline" size="sm" disabled={page === 1 || state.status === 'loading-more'} onClick={() => setCursors((c) => c.slice(0, -1))}>Newer</Button>
            <span className="muted">Page {page} · {state.items.length} entries</span>
            <Button variant="outline" size="sm" disabled={!state.next || state.status === 'loading-more'} onClick={() => setCursors((c) => [...c, state.next])}>Older</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
