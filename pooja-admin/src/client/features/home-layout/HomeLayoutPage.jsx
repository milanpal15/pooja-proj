import { useState } from 'react';

import { useAccess } from '../../lib/access/index.js';
import { Badge, Banner, Button, EmptyState, ErrorState, ReadOnlyBadge, TableSkeleton, useConfirm } from '../../ui/index.js';
import { PhonePreview } from './components/PhonePreview.jsx';
import { SectionList } from './components/SectionList.jsx';
import { SectionModal } from './components/SectionModal/index.js';
import { SectionViewModal } from './components/SectionViewModal.jsx';
import { useHomeSections } from './hooks/useHomeSections.js';
import { useSectionEditor } from './hooks/useSectionEditor.js';

/**
 * Home layout: order, switch on or off, and schedule every block of the app's
 * Home screen. Changes show on the next app launch. `area` (content) decides
 * whether this account may edit; without it the page is a read-only list.
 */
export function HomeLayoutPage({ area }) {
  const canEdit = useAccess().canEdit(area);
  const confirm = useConfirm();
  const h = useHomeSections();
  const editor = useSectionEditor({ sections: h.sections, onSave: h.save });
  const [viewing, setViewing] = useState(null);

  const edit = (section) => (canEdit ? editor.open(section) : setViewing(section));
  const askDelete = async (section) => {
    const ok = await confirm({ title: 'Delete section', message: `Delete “${section.title}”? Its items go with it.`, confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    editor.close();
    await h.remove(section);
  };

  return (
    <div className="ui-page">
      <div className="hl-head">
        <p className="content-lede">Order, switch on or off, and schedule the shelves on the app’s Home screen; the slider has its own tab. Changes show on the next app launch, no release needed.</p>
        {canEdit ? <Button onClick={() => editor.open(null)}>+ Add section</Button> : <ReadOnlyBadge />}
      </div>
      {h.status === 'loading' && <TableSkeleton rows={6} />}
      {h.status === 'error' && <ErrorState message={h.error} offline={h.offline} onRetry={h.reload} />}
      {h.status === 'stale' && (
        <Banner tone="warning" action={<Button variant="outline" size="sm" onClick={h.reload}>Try again</Button>}>
          Showing the last layout we got. {h.error}
        </Banner>
      )}
      {(h.status === 'ready' || h.status === 'stale') && h.sections.length === 0 && (
        <EmptyState title="No Home blocks yet" action={canEdit ? <Button onClick={() => editor.open(null)}>+ Add section</Button> : undefined}>
          The phone shows its bundled order until the API seeds the default layout.
        </EmptyState>
      )}
      {h.sections.length > 0 && (
        <div className="hl-layout">
          <div>
            <SectionList sections={h.sections} heroSlides={h.heroSlides} canEdit={canEdit} onToggle={h.toggle} onEdit={edit} onMove={h.move} />
            <p className="feat-note feat-note--bare hl-legend">
              <Badge tone="accent">Dashboard</Badge> you write the items here <Badge tone="success">Automatic</Badge> built from content that already has its own tab. Rows marked <Badge tone="neutral">Fixed in the app</Badge> are drawn by the app itself; only the shelves can be reordered or scheduled here.
              {!canEdit && ' You can look at this page, not change it.'}
            </p>
          </div>
          <PhonePreview sections={h.sections} />
        </div>
      )}
      {editor.draft && <SectionModal editor={editor} onDelete={askDelete} />}
      {viewing && <SectionViewModal section={viewing} heroSlides={h.heroSlides} onClose={() => setViewing(null)} />}
    </div>
  );
}
