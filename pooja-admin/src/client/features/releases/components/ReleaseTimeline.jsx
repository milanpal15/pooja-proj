import { Badge, Button, Card, EmptyState } from '../../../ui/index.js';
import { formatDateTime } from '../../../lib/dates.js';

const TONE = { live: 'success', draft: 'neutral', withdrawn: 'outline' };
const TAG_TONE = { Minimum: 'danger', Recommended: 'success', Blocked: 'danger' };

/** Registered builds, newest first, with what the policy currently does to each and how many devices run it. */
export function ReleaseTimeline({ items, readOnly, onNew, onEdit, onWithdraw, onBlock }) {
  return (
    <Card title="Releases" description="Builds you have registered. Tags show what the policy does to each." actions={!readOnly && <Button onClick={onNew}>New release</Button>}>
      {items.length === 0 ? (
        <EmptyState title="No releases registered yet" action={!readOnly && <Button onClick={onNew}>Register the first release</Button>}>
          Register each build you publish, so the policy can name it and the Impact preview can show its version name.
        </EmptyState>
      ) : (
        <ol className="tl">
          {items.map((r) => (
            <li key={r._id ?? r.versionCode} className="tl__item">
              <span className={`tl__dot tl__dot--${r.status}`} aria-hidden="true" />
              <div className="tl__main">
                <div className="tl__head">
                  <strong>{r.versionName}</strong>
                  <span className="muted">build {r.versionCode}</span>
                  <Badge tone={TONE[r.status] || 'neutral'}>{r.status}</Badge>
                  {r.tags.map((t) => <Badge key={t} tone={TAG_TONE[t]}>{t}</Badge>)}
                </div>
                <div className="tl__meta">
                  {r.releasedAt ? `Released ${formatDateTime(r.releasedAt)}` : r.status === 'draft' ? 'Not released yet' : ''}
                  {r.devices != null ? ` · ${r.devices.toLocaleString('en-IN')} device${r.devices === 1 ? '' : 's'}` : ''}
                  {r.activeDevices7d != null ? ` · ${r.activeDevices7d.toLocaleString('en-IN')} active in 7d` : ''}
                </div>
                {r.notes && <p className="tl__notes">{r.notes}</p>}
                {!readOnly && (
                  <div className="ui-actions">
                    <Button variant="outline" size="sm" onClick={() => onEdit(r)}>Edit</Button>
                    {!r.tags.includes('Blocked') && r.status !== 'withdrawn' && <Button variant="outline" size="sm" onClick={() => onBlock(r)}>Block this build</Button>}
                    {r.status !== 'withdrawn' && <Button variant="danger" size="sm" onClick={() => onWithdraw(r)}>Withdraw</Button>}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
