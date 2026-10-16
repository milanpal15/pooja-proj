import { Banner, Button, Card, ProgressBar, Skeleton } from '../../../../ui/index.js';
import { milestonePct } from '../../lib/events.js';

/**
 * "Progress so far": the share of joined devotees who completed each
 * milestone, from the event's stats. Unknown is "—", never a guess.
 */
export function ProgressCard({ milestones, stats }) {
  const { status, data } = stats;
  return (
    <Card title="Progress so far">
      {status === 'loading' && <Skeleton height="80px" />}
      {status === 'error' && (
        <Banner tone="warning" action={<Button variant="outline" size="sm" onClick={stats.reload}>Try again</Button>}>Could not load progress. {stats.error}</Banner>
      )}
      {(status === 'ready' || status === 'stale') && (
        <div className="ev-progress">
          {milestones.length === 0 && <p className="ui-field__hint">No milestones yet.</p>}
          {milestones.map((m, i) => {
            const v = milestonePct(data, m.key);
            const name = m.title || `Milestone ${i + 1}`;
            return (
              <div key={m.key} className="ev-progress__row">
                <span title={name}>{name}</span>
                {v == null ? <span className="ev-finish__none">—</span> : <ProgressBar value={v} label={`${name} completed`} />}
                <span>{v == null ? '—' : `${v}%`}</span>
              </div>
            );
          })}
          <p className="ui-field__hint">Share of joined devotees who completed each milestone. Shows “—” until the numbers are known.</p>
        </div>
      )}
    </Card>
  );
}
