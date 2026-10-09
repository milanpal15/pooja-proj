import { useState } from 'react';

import { useAccess } from '../../lib/access/index.js';
import { useRefOptions } from '../../lib/hooks/useRefOptions.js';
import { Banner, Button, Card, EmptyState, ErrorState, ReadOnlyBadge, TableSkeleton, useConfirm } from '../../ui/index.js';
import { PoojaFilters } from './components/PoojaFilters.jsx';
import { PoojaModal } from './components/PoojaModal/index.js';
import { PoojaTable } from './components/PoojaTable.jsx';
import { PoojaViewModal } from './components/PoojaViewModal.jsx';
import { usePoojaEditor } from './hooks/usePoojaEditor.js';
import { usePoojas } from './hooks/usePoojas.js';

/**
 * Poojas: each is a bookable event with its own packages, paid in coins.
 * `area` (content) decides whether this account may write; without it the
 * page is a read-only list that opens details as text.
 */
export function PoojasPage({ area }) {
  const canEdit = useAccess().canEdit(area);
  const confirm = useConfirm();
  const refs = useRefOptions();
  const list = usePoojas(refs.nameOf);
  const editor = usePoojaEditor({ onSaved: list.reload });
  const [viewing, setViewing] = useState(null);

  const edit = (p) => (canEdit ? editor.openEdit(p) : setViewing(p));
  const askDelete = async (p) => {
    const ok = await confirm({ title: 'Delete pooja', message: `Delete “${p.title}”?${p.bookingCount ? ` It has ${p.bookingCount} booking${p.bookingCount === 1 ? '' : 's'}; they stay in Bookings.` : ''}`, confirmLabel: 'Delete', tone: 'danger' });
    if (ok) await list.remove(p);
  };
  const loaded = list.status === 'ready' || list.status === 'stale';

  return (
    <div className="ui-page">
      <div className="hl-head">
        <p className="content-lede">Each pooja is a bookable event with its own packages. Devotees pay in coins.</p>
        {canEdit ? (
          <div className="ui-actions">
            <Button variant="outline" loading={list.busy === 'import'} onClick={list.importSevas}>
              Import from sevas
            </Button>
            <Button onClick={editor.openNew}>+ New pooja</Button>
          </div>
        ) : (
          <ReadOnlyBadge />
        )}
      </div>
      {list.status === 'stale' && <Banner tone="warning">Showing the last list we got. {list.error}</Banner>}
      <PoojaFilters filters={list.filters} temples={refs.temples} festivals={refs.festivals} onChange={list.setFilter} />
      <Card flush>
        {list.status === 'loading' && <TableSkeleton />}
        {list.status === 'error' && <ErrorState message={list.error} offline={list.offline} onRetry={list.reload} />}
        {loaded && list.total === 0 && (
          <EmptyState title="No poojas yet" action={canEdit ? <Button onClick={editor.openNew}>+ New pooja</Button> : undefined}>
            Create one, or import the existing sevas as poojas with a single package each.
          </EmptyState>
        )}
        {loaded && list.total > 0 && list.rows.length === 0 && (
          <EmptyState title="No poojas match" action={<Button variant="outline" onClick={list.clearFilters}>Clear filters</Button>} />
        )}
        {loaded && list.rows.length > 0 && (
          <PoojaTable rows={list.rows} busy={list.busy} opening={editor.opening} nameOf={refs.nameOf} canEdit={canEdit} onToggle={list.toggle} onEdit={edit} onDuplicate={list.duplicate} onDelete={askDelete} />
        )}
      </Card>
      <p className="feat-note feat-note--bare">Status is automatic from the booking window. {canEdit ? '' : 'You can look at this page, not change it.'}</p>
      {editor.draft && <PoojaModal editor={editor} refs={refs} />}
      {viewing && <PoojaViewModal pooja={viewing} nameOf={refs.nameOf} onClose={() => setViewing(null)} />}
    </div>
  );
}
