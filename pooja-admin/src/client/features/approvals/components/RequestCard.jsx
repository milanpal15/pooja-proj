import { formatDateTime } from '../../../lib/dates.js';
import { Badge, Button, Card, DiffView } from '../../../ui/index.js';
import { POLICY_LABELS, STATUS_TONE, formatValue, hoursLeft, isOwn, stripBookkeeping } from '../lib/approvals.js';

/** One request: who asked, what changes (before → after), and the decision buttons — or why there are none. */
export function RequestCard({ r, me, mayApprove, busy, highlight, onApprove, onReject, onCancel }) {
  const own = isOwn(r, me.username);
  const pending = r.status === 'pending';
  const left = hoursLeft(r);
  return (
    <Card
      id={`req-${r._id}`}
      className={highlight ? 'req req--hl' : 'req'}
      title={r.summary || 'Change request'}
      description={
        <>
          Requested by <b>{r.requestedBy}</b> · {formatDateTime(r.requestedAt)}
          {pending && r.expiresAt ? ` · expires in ${left} h` : ''}
        </>
      }
      actions={<Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge>}>
      <DiffView
        before={stripBookkeeping(r.payload?.before)}
        after={stripBookkeeping(r.payload?.after)}
        labels={POLICY_LABELS}
        format={formatValue}
        label={`Changes in “${r.summary || 'request'}”`}
      />
      {!pending && (
        <p className="req__decided">
          {r.status === 'approved' && <>Approved by <b>{r.decidedBy}</b>{r.selfApproved ? ' (self-approved: the only approver)' : ''} · {formatDateTime(r.decidedAt)}.</>}
          {r.status === 'rejected' && <>Rejected by <b>{r.decidedBy}</b> · {formatDateTime(r.decidedAt)}.</>}
          {r.status === 'cancelled' && <>Cancelled by <b>{r.decidedBy || r.requestedBy}</b>.</>}
          {r.status === 'expired' && <>Not decided within 24 hours.</>}
          {r.note ? <> Note: “{r.note}”</> : null}
        </p>
      )}
      {pending && own && (
        <div className="req__lock" role="note">
          <span aria-hidden="true">🔒</span>
          <span>You requested this change, so a different operator has to approve it. You can withdraw it.</span>
          {!!onCancel && <Button variant="outline" size="sm" loading={busy} onClick={() => onCancel(r)}>Cancel request</Button>}
        </div>
      )}
      {pending && !own && mayApprove && (
        <div className="ui-actions req__actions">
          <Button variant="danger" loading={false} disabled={busy} onClick={() => onReject(r)}>Reject…</Button>
          <Button loading={busy} onClick={() => onApprove(r)}>Approve…</Button>
        </div>
      )}
      {pending && !own && !mayApprove && <p className="muted req__decided">You can look at this request but not decide it.</p>}
    </Card>
  );
}
