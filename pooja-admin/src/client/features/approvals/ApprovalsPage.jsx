import { useState } from 'react';

import { useAccess } from '../../lib/access/index.js';
import { Banner, Card, EmptyState, ErrorState, ReadOnlyBadge, Switch, TableSkeleton, Tabs, useConfirm } from '../../ui/index.js';
import { DecisionModal } from './components/DecisionModal.jsx';
import { RequestCard } from './components/RequestCard.jsx';
import { useApprovals } from './hooks/useApprovals.js';

const TABS = (n) => [
  { id: 'pending', label: n ? `Pending (${n})` : 'Pending' },
  { id: 'history', label: 'History' },
];

/**
 * Approvals (docs/RELEASES.md §5, §7), area `approvals`. A risky change waits here for a DIFFERENT operator. Each request
 * shows what it changes before → after; approving re-checks and applies it on the server. Your own request is locked
 * (you may only cancel it). Without `approvals:edit` the queue is read-only. `rest[0]` deep-links one request.
 */
export function ApprovalsPage({ me, area, rest = [] }) {
  const canEdit = useAccess().canEdit(area);
  const confirm = useConfirm();
  const a = useApprovals();
  const [tab, setTab] = useState('pending');
  const [deciding, setDeciding] = useState(null); // { request, kind }
  const focus = rest[0];

  const toggle = async (on) => {
    if (!on) {
      const ok = await confirm({
        title: 'Turn approvals off',
        message: 'Risky changes (raising the minimum build, blocking a build, maintenance) will apply immediately, with no second operator. It is recorded in the audit log.',
        confirmLabel: 'Turn approvals off',
        tone: 'danger',
      });
      if (!ok) return;
    }
    a.setEnabled(on);
  };

  if (a.status === 'loading') return <div className="ui-page"><TableSkeleton rows={6} /></div>;
  if (a.status === 'error') return <div className="ui-page"><ErrorState message={a.error} offline={a.offline} onRetry={a.reload} /></div>;

  const list = tab === 'pending' ? a.pending : a.history;
  const decide = async (note) => {
    const ok = deciding.kind === 'reject' ? await a.reject(deciding.request, note) : await a.approve(deciding.request, note);
    if (ok) setDeciding(null);
  };

  return (
    <div className="ui-page">
      <Card title="Second-operator approval" description="Changes that could lock people out wait here until a different operator approves them. Relief (lowering the minimum, unblocking, turning maintenance off) is never held." actions={!canEdit && <ReadOnlyBadge />}>
        {a.settingsKnown && (
          canEdit ? (
            <Switch variant="card" label="Require approval for risky changes" hint={a.approvalsEnabled ? 'On. A different operator must approve. If you are the only approver, your change applies at once and is recorded as self-approved.' : 'Off. Risky changes apply immediately.'} checked={a.approvalsEnabled} disabled={a.busy === 'settings'} onChange={toggle} />
          ) : (
            <p className="muted" style={{ margin: 0 }}>Approvals are <b>{a.approvalsEnabled ? 'on' : 'off'}</b>. Only an administrator can change this.</p>
          )
        )}
      </Card>

      <Tabs label="Approvals" tabs={TABS(a.pending.length)} value={tab} onChange={setTab} />

      {list.length === 0 ? (
        <EmptyState title={tab === 'pending' ? 'Nothing is waiting' : 'No decisions yet'}>
          {tab === 'pending' ? 'When an operator asks for a risky change it appears here and in the bell at the top.' : 'Approved, rejected, cancelled and expired requests are listed here.'}
        </EmptyState>
      ) : (
        <div className="ui-page" role="list" aria-label={tab === 'pending' ? 'Pending requests' : 'Past requests'}>
          {list.map((r) => (
            <div role="listitem" key={r._id}>
              <RequestCard r={r} me={me} mayApprove={canEdit} busy={a.busy === r._id} highlight={focus === r._id}
                onApprove={(x) => setDeciding({ request: x, kind: 'approve' })} onReject={(x) => setDeciding({ request: x, kind: 'reject' })} onCancel={a.cancel} />
            </div>
          ))}
        </div>
      )}
      {a.pending.some((r) => r.requestedBy === me.username) && tab === 'pending' && <Banner tone="warning">Requests you made are locked for you. Ask a colleague to approve them.</Banner>}
      {deciding && <DecisionModal request={deciding.request} kind={deciding.kind} onClose={() => setDeciding(null)} onSubmit={decide} />}
    </div>
  );
}
