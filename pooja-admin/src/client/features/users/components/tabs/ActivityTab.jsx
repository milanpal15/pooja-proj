import { Badge } from '../../../../ui/index.js';
import { formatWhen } from '../../../../lib/dates.js';
import { activityItems } from '../../lib/format.js';
import { SectionGate } from './SectionGate.jsx';

const TONE = { block: 'danger', unblock: 'success', auto_unblock: 'success', audit: 'neutral' };

/** Block history and the operator actions recorded about this person, newest first. */
export function ActivityTab({ detail, onRetry }) {
  const items = activityItems(detail);
  return (
    <SectionGate detail={detail} tab="activity" label="Activity" emptyTitle="Nothing recorded" emptyText="No block, note or operator action has been recorded for this person." onRetry={onRetry}>
      <ol className="tl">
        {items.map((it) => (
          <li key={it.key} className="tl__item">
            <span className={`tl__dot ${it.kind === 'unblock' || it.kind === 'auto_unblock' ? 'tl__dot--live' : ''}`} aria-hidden="true" />
            <div className="tl__main">
              <div className="tl__head">
                <Badge tone={TONE[it.kind] ?? 'neutral'}>{it.title}</Badge>
                {it.by && <span className="tl__meta">by {it.by}</span>}
                <span className="tl__meta">{formatWhen(it.at)}</span>
              </div>
              {it.detail && <p className="tl__notes">{it.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </SectionGate>
  );
}
