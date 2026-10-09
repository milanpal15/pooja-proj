import { api } from '../../../lib/api/index.js';
import { formatWhen } from '../../../lib/dates.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { Card, DataTable, EmptyState, ErrorState, TableSkeleton } from '../../../ui/index.js';
import { roleLabel } from '../lib/roles.js';

/** What an entry did, from its method + path: "PUT /api/content/deities/42" -> "Changed content/deities/42". */
const VERB = { POST: 'Created', PUT: 'Changed', PATCH: 'Changed', DELETE: 'Deleted' };
const describe = (e) => {
  const path = String(e.path || '').replace(/^\/api\//, '');
  return `${VERB[e.method] || e.method} ${path}`.trim();
};

/** Recent writes by operators (admin only). The server appends; nothing here edits it. */
export function AuditLog() {
  const log = useLoader(() => api.auditLog(100));
  const loaded = log.status === 'ready' || log.status === 'stale';
  const rows = log.data || [];
  return (
    <Card flush title="Audit log" description="The latest changes made by dashboard operators, newest first.">
      {log.status === 'loading' && <TableSkeleton rows={3} />}
      {log.status === 'error' && <ErrorState message={log.error} offline={log.offline} onRetry={log.reload} />}
      {loaded && rows.length === 0 && <EmptyState title="Nothing recorded yet">Every change an operator makes appears here.</EmptyState>}
      {loaded && rows.length > 0 && (
        <DataTable label="Audit log" minWidth={680}>
          <thead>
            <tr>
              <th>When</th>
              <th>Operator</th>
              <th>What</th>
              <th>Area</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={`${e.at}-${i}`}>
                <td>{formatWhen(e.at)}</td>
                <td>
                  {e.operator}
                  <span className="sub">{roleLabel(e.role)}</span>
                </td>
                <td>{describe(e)}</td>
                <td>{e.area}</td>
                <td>{e.status}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Card>
  );
}
