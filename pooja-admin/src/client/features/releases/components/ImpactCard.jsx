import { Banner, Card, Skeleton } from '../../../ui/index.js';
import { headline } from '../lib/impact.js';
import { VersionsChart } from './VersionsChart.jsx';

/**
 * Impact preview: what the policy as typed (not yet saved) would do to the real devices seen in the last 30 days.
 * Counts come from the server; before the first answer, or while an unreadable number is typed, it says so.
 */
export function ImpactCard({ impact, hyp, usage }) {
  const h = headline(impact.data);
  const byVersion = impact.data?.byVersion ?? usage?.byVersion ?? [];
  return (
    <Card title="Impact preview" description="Updates as you type. Counted from the devices that opened the app recently.">
      {!hyp && <Banner tone="warning">Fix the number boxes to see the impact.</Banner>}
      {hyp && impact.error && <Banner tone="error">{impact.error}</Banner>}
      <div className="impact__headline" aria-live="polite">
        {h ? (
          <>
            <strong className={impact.data.devices.blocked > 0 ? 'impact__big impact__big--bad' : 'impact__big'}>{h.blocks}</strong>
            <span className="muted">
              {[h.nudges, h.os, h.thirty, h.total].filter(Boolean).join(' · ')}
              {impact.loading ? ' · updating…' : ''}
            </span>
          </>
        ) : impact.loading ? (
          <Skeleton width="70%" height="1.4em" />
        ) : (
          <span className="muted">No devices have reported a version yet.</span>
        )}
      </div>
      {byVersion.length > 0 ? <VersionsChart byVersion={byVersion} hyp={hyp || {}} /> : !impact.loading && <p className="muted">Versions in use will appear here once phones with version reporting open the app.</p>}
    </Card>
  );
}
