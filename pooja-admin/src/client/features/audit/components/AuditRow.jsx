import { Badge, Button, DiffView } from '../../../ui/index.js';
import { describe, hasDetail, resultTone, whenLabel } from '../lib/audit.js';

/** One audit entry; the detail row (before → after) opens under it. */
export function AuditRows({ e, open, onToggle, labelOf }) {
  const [tone, word] = resultTone(e.status);
  const id = `audit-${e.id}`;
  return (
    <>
      <tr className={open ? 'audit__row audit__row--open' : 'audit__row'}>
        <td>{whenLabel(e.at)}</td>
        <td>{e.operator}<span className="sub">{labelOf(e.role)}</span></td>
        <td>{describe(e)}{e.targetId ? <span className="sub">{e.targetId}</span> : null}</td>
        <td>{e.area}</td>
        <td>
          <Badge tone={tone}>{word}</Badge>
          {e.selfApproved && <Badge tone="info">self-approved</Badge>}
        </td>
        <td className="actions">
          <Button variant="outline" size="sm" aria-expanded={open} aria-controls={id} aria-label={`${open ? 'Hide' : 'Show'} details of ${describe(e)}`} onClick={onToggle}>
            {open ? 'Hide' : hasDetail(e) ? 'Changes' : 'Details'}
          </Button>
        </td>
      </tr>
      {open && (
        <tr id={id} className="audit__detail">
          <td colSpan={6}>
            <dl className="audit__meta">
              <div><dt>Request</dt><dd><code>{e.method} {e.path}</code></dd></div>
              <div><dt>At</dt><dd>{e.at ? new Date(e.at).toLocaleString('en-IN') : '—'}</dd></div>
            </dl>
            {hasDetail(e) ? <DiffView before={e.before} after={e.after} label="Before and after" /> : <p className="muted audit__none">Before and after values are recorded for version-policy, release, approval and role writes. This action recorded none.</p>}
          </td>
        </tr>
      )}
    </>
  );
}
