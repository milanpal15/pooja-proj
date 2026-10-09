import { Button, StatusText, Switch } from '../../../ui/index.js';
import { roleLabel } from '../lib/roles.js';
import { RoleSelect } from './RoleSelect.jsx';

export function OperatorRow({ operator: o, isMe, busy, readOnly = false, onSetRole, onToggleActive, onSetPassword, onDelete }) {
  return (
    <tr>
      <td>
        {o.username}
        {isMe && <span className="muted"> · you</span>}
      </td>
      <td>
        {readOnly ? (
          roleLabel(o.role)
        ) : (
          <RoleSelect value={o.role} label={`Role of ${o.username}`} disabled={busy || isMe} onChange={(role) => onSetRole(o, role)} />
        )}
      </td>
      <td className="muted">{o.lastLogin ? new Date(o.lastLogin).toLocaleString() : 'never'}</td>
      <td>
        {readOnly ? (
          <StatusText on={!!o.active} onLabel="Active" offLabel="Suspended" />
        ) : (
          <Switch label={`Active: ${o.username}`} checked={!!o.active} disabled={busy || isMe} onChange={() => onToggleActive(o)} />
        )}
      </td>
      {!readOnly && (
        <td className="actions">
          <div className="ui-actions">
            <Button variant="outline" size="sm" aria-label={`Set password for ${o.username}`} onClick={() => onSetPassword(o)}>
              Set password
            </Button>
            {/* Your own row has no destructive controls at all — the
                server refuses anyway, but an enabled button that
                always errors is worse than no button. */}
            {!isMe && (
              <Button variant="danger" size="sm" disabled={busy} aria-label={`Delete ${o.username}`} onClick={() => onDelete(o)}>
                Delete
              </Button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
