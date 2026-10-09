import { Card } from '../../../ui/index.js';

export function SessionsChart({ trend }) {
  const max = Math.max(1, ...(trend || []).map((t) => t.count));
  return (
    <Card title="Sessions · last 14 days">
      <div className="chart">
        {(trend || []).map((t) => (
          <div className="bar-wrap" key={t.day} title={`${t.day}: ${t.count}`}>
            <div className="bar" style={{ height: `${(t.count / max) * 100}%` }} />
            <span className="bar-label">{t.day.slice(8)}</span>
          </div>
        ))}
        {(!trend || trend.length === 0) && <p className="muted">No sessions yet</p>}
      </div>
    </Card>
  );
}
