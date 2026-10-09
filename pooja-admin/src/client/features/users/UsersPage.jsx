import { useAccess } from '../../lib/access/index.js';
import { Card, DataTable, EmptyState, ErrorState, ReadOnlyBadge, useConfirm } from '../../ui/index.js';
import { UserRow } from './components/UserRow.jsx';
import { useUsers } from './hooks/useUsers.js';

/** Devotees (not dashboard operators): list, block/unblock, delete. */
export function UsersPage({ area = 'devotees' }) {
  const confirm = useConfirm();
  const readOnly = !useAccess().canEdit(area);
  const { rows, err, reload, toggleBlock, remove } = useUsers();

  const askDelete = async (u) => {
    const ok = await confirm({
      title: 'Delete user',
      message: `Delete ${u.name || u.contact}?`,
      confirmLabel: 'Delete user',
      tone: 'danger',
    });
    if (ok) await remove(u);
  };

  if (err) return <ErrorState message={err} onRetry={reload} />;

  return (
    <div className="ui-page">
      <Card flush>
        <div className="ui-toolbar">
          <span className="ui-toolbar__note">{rows.length} users</span>
          {readOnly && <ReadOnlyBadge />}
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No users yet">Sign in on the app to create one.</EmptyState>
        ) : (
          <DataTable label="Users" minWidth={760}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Method</th>
                <th>Last Active</th>
                <th>Status</th>
                {!readOnly && <th aria-label="Actions"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <UserRow key={u._id} user={u} readOnly={readOnly} onToggleBlock={toggleBlock} onDelete={askDelete} />
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  );
}
