import { api } from '../../lib/api/index.js';
import { usePoll } from '../../lib/hooks/usePoll.js';
import { Card, DataTable, EmptyState, ErrorNote } from '../../ui/index.js';

export function VisitorsPage() {
  const { data, err } = usePoll(() => api.visitors(), [], 6000);
  if (err) return <ErrorNote msg={err} />;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div className="ui-page">
      <Card flush>
        {data.length === 0 ? (
          <EmptyState title="No visitors yet" />
        ) : (
          <DataTable label="Visitors" minWidth={560}>
            <thead>
              <tr>
                <th>Device</th>
                <th>OS</th>
                <th className="num">Sessions</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <tr key={v._id}>
                  <td>{v.model || v.deviceId}</td>
                  <td className="muted">{v.os}</td>
                  <td className="num">{v.sessions}</td>
                  <td className="muted">{new Date(v.lastActive).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  );
}
