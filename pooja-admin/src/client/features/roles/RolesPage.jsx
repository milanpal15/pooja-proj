import { useState } from 'react';

import { api } from '../../lib/api/index.js';
import { useAccess } from '../../lib/access/index.js';
import { formatWhen } from '../../lib/dates.js';
import { Badge, Banner, Button, Card, DataTable, EmptyState, ErrorState, Field, Modal, ReadOnlyBadge, TableSkeleton, useConfirm, useToast } from '../../ui/index.js';
import { RoleEditor } from './components/RoleEditor.jsx';
import { useRoles } from './hooks/useRoles.js';
import { slugify } from './lib/matrix.js';

/**
 * Roles & permissions (docs/ROLES.md §3), area `roles`. `rest[0]` is the editor: `#/admin/roles/<key>` or
 * `#/admin/roles/new`; no segment shows the list. Built-in roles are locked presets.
 */
export function RolesPage({ area, rest = [] }) {
  const canEdit = useAccess().canEdit(area);
  const confirm = useConfirm();
  const toast = useToast();
  const r = useRoles();
  const [dup, setDup] = useState(null);
  const sel = rest[0];

  if (r.status === 'loading') return <div className="ui-page"><TableSkeleton rows={6} /></div>;
  if (r.status === 'error') return <div className="ui-page"><ErrorState message={r.error} offline={r.offline} onRetry={r.reload} /></div>;

  if (sel) {
    const role = sel === 'new' ? null : r.roles.find((x) => x.key === sel);
    if (sel !== 'new' && !role) {
      return (
        <div className="ui-page">
          <EmptyState title="That role doesn’t exist" action={<a className="rel-link" href="#/admin/roles">Back to all roles</a>}>It may have been deleted.</EmptyState>
        </div>
      );
    }
    return <div className="ui-page"><RoleEditor key={sel} role={role} isNew={sel === 'new'} roles={r.roles} areas={r.areas} canEdit={canEdit} onDuplicate={setDup} onSaved={r.reload} />{dupModal()}</div>;
  }

  function dupModal() {
    return dup && <DuplicateModal source={dup} taken={r.roles.map((x) => x.key)} onClose={() => setDup(null)} onDone={async (key) => { setDup(null); await r.reload(); window.location.hash = `#/admin/roles/${key}`; }} />;
  }

  const remove = async (role) => {
    const ok = await confirm({ title: 'Delete role', message: `Delete the role “${role.name}”? This cannot be undone.`, confirmLabel: 'Delete role', tone: 'danger' });
    if (!ok) return;
    try {
      await api.roles.remove(role.key);
      toast.success(`Role “${role.name}” deleted`);
      await r.reload();
    } catch (e) {
      toast.error(e.code === 'in_use' ? `Cannot delete “${role.name}”: ${e.body?.operatorCount ?? role.operatorCount ?? 'some'} operator(s) still have this role. Move them to another role first.` : `Could not delete the role. ${e.message}`);
      await r.reload();
    }
  };

  return (
    <div className="ui-page">
      <Card flush>
        <div className="ui-toolbar">
          <span className="ui-toolbar__note">{r.roles.length} roles · {r.roles.filter((x) => !x.builtin).length} custom</span>
          {canEdit ? <Button onClick={() => (window.location.hash = '#/admin/roles/new')}>+ New role</Button> : <ReadOnlyBadge />}
        </div>
        <div style={{ padding: '0 24px 16px' }}>
          <Banner tone="warning">A role decides what an operator can see and change. Changes reach signed-in operators within about 30 seconds. You can only grant what you hold yourself.</Banner>
        </div>
        <DataTable label="Roles" minWidth={760}>
          <thead>
            <tr><th>Role</th><th>Description</th><th className="num">Operators</th><th>Last edited</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {r.roles.map((role) => (
              <tr key={role.key}>
                <td>
                  <a className="role-link" href={`#/admin/roles/${role.key}`}>
                    {role.builtin && <span aria-label="Built-in, read-only" title="Built-in, read-only">🔒 </span>}
                    {role.name}
                  </a>
                  <span className="sub">{role.key}{role.builtin ? ' · built-in' : ''}</span>
                </td>
                <td className="muted">{role.description || '—'}</td>
                <td className="num">{role.operatorCount ?? 0}</td>
                <td className="muted">{role.builtin ? 'Preset' : role.updatedAt ? <>{formatWhen(role.updatedAt)}{role.updatedBy ? <span className="sub">{role.updatedBy}</span> : null}</> : '—'}</td>
                <td className="actions">
                  <div className="ui-actions">
                    <Button variant="outline" size="sm" onClick={() => (window.location.hash = `#/admin/roles/${role.key}`)} aria-label={`${canEdit && !role.builtin ? 'Edit' : 'View'} ${role.name}`}>{canEdit && !role.builtin ? 'Edit' : 'View'}</Button>
                    {canEdit && <Button variant="outline" size="sm" onClick={() => setDup(role)} aria-label={`Duplicate ${role.name}`}>Duplicate</Button>}
                    {canEdit && !role.builtin && <Button variant="danger" size="sm" onClick={() => remove(role)} aria-label={`Delete ${role.name}`}>Delete</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
      {dupModal()}
    </div>
  );
}

function DuplicateModal({ source, taken, onClose, onDone }) {
  const toast = useToast();
  const [name, setName] = useState(`${source.name} copy`);
  const [key, setKey] = useState(slugify(`${source.key}-copy`));
  const [busy, setBusy] = useState(false);
  const bad = !/^[a-z0-9][a-z0-9_-]{2,29}$/.test(key) ? 'Use 3 to 30 characters: lowercase letters, digits, - or _.' : taken.includes(key) ? 'A role with this key already exists.' : '';
  return (
    <Modal open onClose={onClose} size="sm" title={`Duplicate ${source.name}`} dismissible={!busy}
      footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!!bad || !name.trim()} onClick={async () => {
        setBusy(true);
        try {
          await api.roles.duplicate(source.key, { key, name: name.trim() });
          toast.success(`Created “${name.trim()}”`);
          await onDone(key);
        } catch (e) {
          toast.error(`Could not duplicate. ${e.message}`);
          setBusy(false);
        }
      }}>Duplicate</Button></>}>
      <Field label="Name" value={name} onChange={(v) => { setName(v); setKey(slugify(v)); }} />
      <Field label="Key" value={key} onChange={(v) => setKey(v.toLowerCase())} error={bad} hint="Cannot be changed later." />
    </Modal>
  );
}
