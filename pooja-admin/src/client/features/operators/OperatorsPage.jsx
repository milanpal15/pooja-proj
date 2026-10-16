import { useAccess } from '../../lib/access/index.js';
import { Banner, Button, Card, DataTable, ReadOnlyBadge, useConfirm } from '../../ui/index.js';
import { AuditLog } from './components/AuditLog.jsx';
import { OperatorModal } from './components/OperatorModal.jsx';
import { roleLabel } from './lib/roles.js';
import { RoleGuide } from './components/RoleSelect.jsx';
import { OperatorRow } from './components/OperatorRow.jsx';
import { ResetPasswordModal } from './components/ResetPasswordModal.jsx';
import { useOperators } from './hooks/useOperators.js';

/**
 * The people who sign in to this dashboard.
 *
 * Not the Users tab — that is devotees, who sign in to the app with
 * Firebase and have no access here at all. Keeping them in separate tabs
 * with separate words is deliberate: the one mistake worth designing
 * against is an operator thinking "delete user" means an operator account.
 *
 * Area `operators`: nobody without it sees this tab, and the server answers
 * 403 even if they reach the URL by hand.
 */
export function OperatorsPage({ me, area = 'operators' }) {
  const confirm = useConfirm();
  const readOnly = !useAccess().canEdit(area);
  const ops = useOperators();

  const askDelete = async (o) => {
    const ok = await confirm({
      title: 'Delete operator',
      message: `Delete the operator "${o.username}"?`,
      confirmLabel: 'Delete operator',
      tone: 'danger',
    });
    if (ok) ops.remove(o);
  };

  const askRole = async (o, role) => {
    if (role === o.role) return;
    const ok = await confirm({
      title: 'Change role',
      message: `Change ${o.username} from ${roleLabel(o.role)} to ${roleLabel(role)}? It takes effect on their next request.`,
      confirmLabel: `Make ${roleLabel(role)}`,
    });
    if (ok) ops.setRole(o, role);
  };

  const askToggle = async (o) => {
    if (o.active) {
      const ok = await confirm({
        title: 'Disable account',
        message: `Disable ${o.username}? They will not be able to sign in or use the dashboard until you enable the account again.`,
        confirmLabel: 'Disable account',
        tone: 'danger',
      });
      if (!ok) return;
    }
    ops.toggleActive(o);
  };

  const modalOpen = !!ops.adding || !!ops.resetting;

  return (
    <div className="ui-page">
      <Card flush>
        <div className="ui-toolbar">
          <span className="ui-toolbar__note">{ops.rows.length} operators</span>
          {readOnly ? (
            <ReadOnlyBadge />
          ) : (
            <Button onClick={() => ops.setAdding({ username: '', password: '', role: 'editor' })}>+ Add operator</Button>
          )}
        </div>

        {!!ops.err && !modalOpen && (
          <div style={{ padding: '16px 24px 0' }}>
            <Banner tone="error">{ops.err}</Banner>
          </div>
        )}

        <div style={{ padding: '16px 24px 0' }}>
          <RoleGuide />
        </div>

        <DataTable label="Operators" minWidth={720}>
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Last signed in</th>
              <th>Active</th>
              {!readOnly && <th aria-label="Actions"></th>}
            </tr>
          </thead>
          <tbody>
            {ops.rows.map((o) => (
              <OperatorRow
                key={o._id}
                operator={o}
                isMe={!!me && o.username === me.username}
                busy={ops.busy === o._id}
                readOnly={readOnly}
                onSetRole={askRole}
                onToggleActive={askToggle}
                onSetPassword={(op) => ops.setResetting({ id: op._id, username: op.username, password: '' })}
                onDelete={askDelete}
              />
            ))}
          </tbody>
        </DataTable>
      </Card>

      {ops.adding && (
        <OperatorModal
          form={ops.adding}
          saving={ops.saving}
          error={ops.err}
          onChange={ops.setAdding}
          onCreate={ops.create}
          onClose={() => ops.setAdding(null)}
        />
      )}

      {ops.resetting && (
        <ResetPasswordModal
          form={ops.resetting}
          saving={ops.saving}
          error={ops.err}
          onChange={ops.setResetting}
          onSave={ops.resetPassword}
          onClose={() => ops.setResetting(null)}
        />
      )}

      <AuditLog />
    </div>
  );
}
