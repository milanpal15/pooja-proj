import { Card, ErrorState, TableSkeleton, useConfirm } from '../../ui/index.js';
import { useAccess } from '../../lib/access/index.js';
import { ContentTable } from './components/ContentTable.jsx';
import { ContentToolbar } from './components/ContentToolbar.jsx';
import { EditModal } from './components/EditModal.jsx';
import { ViewModal } from './components/ViewModal.jsx';
import { useContentResource } from './hooks/useContentResource.js';
import { blankRow, columnsOf } from './lib/fields.js';

/**
 * Generic CRUD manager for a content resource.
 * `fields`: [{ key, label, type }] where type is
 * text | number | textarea | image | audio | csv | bool | date | select |
 * enumList. A field may also carry `default()` for the value a new row
 * starts with.
 *
 * Access (DESIGN.md §21.6): `area` (default "content", fed from the tab
 * registry) decides whether this account can edit. Without `<area>:edit` the
 * manager renders read-only, once, for every content screen: no Add / Edit /
 * Delete / row actions, switches as "On"/"Off" text, rows open a read-only
 * modal, and the header carries a "View only" badge. `readOnly` overrides.
 *
 * Optional: `rowAction` (a custom per-row button; its own `area`, default the
 * manager's, gates it — Push needs `push:edit`), `filterRows` (scope the
 * table), `scopeNote` (what the count describes), `onChange` (fired after a
 * write so a sibling can restate itself).
 */
export function ContentManager({
  title,
  resource,
  fields,
  previewKey,
  rowAction,
  filterRows,
  scopeNote,
  onChange,
  area = 'content',
  readOnly: readOnlyProp,
}) {
  const confirm = useConfirm();
  const access = useAccess();
  const readOnly = readOnlyProp ?? !access.canEdit(area);
  const action = rowAction && access.canEdit(rowAction.area ?? area) ? rowAction : undefined;
  const c = useContentResource({ resource, fields, rowAction: action, onChange });

  // Horoscopes accumulate twelve rows a day forever, so the tab scopes the
  // table to one day. Everything else passes no filter and sees all of it.
  const visible = filterRows ? c.rows.filter(filterRows) : c.rows;

  const askDelete = async (row) => {
    const ok = await confirm({
      title: `Delete ${title}`,
      message: `Delete "${row[previewKey] || row.name || row.title}"?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (ok) await c.remove(row);
  };

  if (c.err) return <ErrorState message={c.err.message} offline={c.err.offline} onRetry={c.reload} />;
  if (!c.loaded) return <TableSkeleton />;

  return (
    <Card flush>
      <ContentToolbar
        count={visible.length}
        scopeNote={scopeNote}
        title={title}
        readOnly={readOnly}
        onAdd={() => c.setEditing(blankRow(fields))}
      />
      <ContentTable
        rows={visible}
        columns={columnsOf(fields)}
        rowAction={action}
        title={title}
        busyRow={c.busyRow}
        readOnly={readOnly}
        onToggle={c.toggleBool}
        onRowAction={c.runRowAction}
        onEdit={(row) => c.setEditing({ ...row })}
        onDelete={askDelete}
      />
      {c.editing && readOnly && <ViewModal title={title} fields={fields} values={c.editing} onClose={() => c.setEditing(null)} />}
      {c.editing && !readOnly && (
        <EditModal
          title={title}
          fields={fields}
          values={c.editing}
          uploading={c.uploading}
          saving={c.saving}
          onChange={c.setField}
          onFile={c.onFile}
          onSave={c.save}
          onClose={() => c.setEditing(null)}
        />
      )}
    </Card>
  );
}
