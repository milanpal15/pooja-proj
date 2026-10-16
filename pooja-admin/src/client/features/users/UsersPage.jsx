import { useState } from 'react';

import { useAccess } from '../../lib/access/index.js';
import { Card, DataTable, EmptyState, ErrorState, Field, ReadOnlyBadge, useConfirm } from '../../ui/index.js';
import { UserRow } from './components/UserRow.jsx';
import { useUsers } from './hooks/useUsers.js';

/** Devotees (not dashboard operators): list, block/unblock, delete. */
export function UsersPage({ area = 'devotees', query }) {
  // `#/people/users?q=…` (from the ⌘K palette) opens the list already filtered.
  const [q, setQ] = useState(query?.q ?? '');
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

  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((u) => `${u.name ?? ''} ${u.contact ?? ''}`.toLowerCase().includes(needle)) : rows;

  if (err) return <ErrorState message={err} onRetry={reload} />;

  return (
    <div className="ui-page">
      <Card flush>
        <div className="ui-toolbar">
          <span className="ui-toolbar__note">{needle ? `${shown.length} of ${rows.length} users` : `${rows.length} users`}</span>
          <Field hideLabel label="Filter users" type="search" className="ui-field--auto" value={q} placeholder="Filter by name or contact" onChange={setQ} />
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
              {shown.map((u) => (
                <UserRow key={u._id} user={u} readOnly={readOnly} onToggleBlock={toggleBlock} onDelete={askDelete} />
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  );
}
