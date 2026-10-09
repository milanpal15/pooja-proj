import { Badge, Button } from '../../../ui/index.js';

export function UserRow({ user: u, readOnly = false, onToggleBlock, onDelete }) {
  const who = u.name || u.contact;
  return (
    <tr>
      <td>{u.name || '—'}</td>
      <td>{u.contact}</td>
      <td className="muted">{u.method}</td>
      <td className="muted">{new Date(u.lastActive).toLocaleString()}</td>
      <td>
        <Badge tone={u.blocked ? 'danger' : 'success'}>{u.blocked ? 'blocked' : 'active'}</Badge>
      </td>
      {!readOnly && (
        <td className="actions">
          <div className="ui-actions">
            <Button variant="outline" size="sm" aria-label={`${u.blocked ? 'Unblock' : 'Block'} ${who}`} onClick={() => onToggleBlock(u)}>
              {u.blocked ? 'Unblock' : 'Block'}
            </Button>
            <Button variant="danger" size="sm" aria-label={`Delete ${who}`} onClick={() => onDelete(u)}>
              Delete
            </Button>
          </div>
        </td>
      )}
    </tr>
  );
}
