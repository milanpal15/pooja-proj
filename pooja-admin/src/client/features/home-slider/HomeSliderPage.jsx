import { useEffect, useRef } from 'react';

import { useAccess } from '../../lib/access/index.js';
import { idOf } from '../../lib/ids.js';
import { Banner, Button, Card, EmptyState, ErrorState, ReadOnlyBadge, TableSkeleton, useConfirm } from '../../ui/index.js';
import { SlidePanel } from './components/SlidePanel.jsx';
import { SlideTable } from './components/SlideTable.jsx';
import { useSlideEditor } from './hooks/useSlideEditor.js';
import { useSlides } from './hooks/useSlides.js';
import { useTargets } from './hooks/useTargets.js';
import { useWide } from './hooks/useWide.js';
import { MAX_LIVE } from './lib/slide.js';

/**
 * Home slider: the slides under the search bar on the app's Home. Table on the
 * left (order, switch), editor on the right (a side panel when wide, a modal
 * when narrow). `area` (content) decides whether this account may write.
 */
export function HomeSliderPage({ area }) {
  const canEdit = useAccess().canEdit(area);
  const confirm = useConfirm();
  const wide = useWide();
  const targets = useTargets();
  const list = useSlides();
  const editor = useSlideEditor({ slides: list.slides, onSaved: list.reload });
  const openId = editor.slide ? idOf(editor.slide) : null;
  const loaded = list.status === 'ready' || list.status === 'stale';

  // Wide: open the first slide once the list arrives, so the panel is never an empty box.
  const auto = useRef(false);
  useEffect(() => {
    if (wide && loaded && !auto.current && list.slides.length && !editor.open) {
      auto.current = true;
      editor.begin(list.slides[0]);
    }
  }, [wide, loaded, list.slides, editor]);

  // Keep the open slide's switch/status in step with the table.
  const live = editor.slide && list.slides.find((s) => idOf(s) === openId);

  const discardOk = async () =>
    !editor.dirty || confirm({ title: 'Discard changes', message: 'This slide has unsaved changes.', confirmLabel: 'Discard', tone: 'danger' });

  const select = async (s) => {
    if (openId === idOf(s)) return;
    if (await discardOk()) editor.begin(s);
  };
  const create = async () => {
    if (await discardOk()) editor.begin(null);
  };
  const close = async () => {
    if (await discardOk()) editor.close();
  };
  const askDelete = async (s) => {
    const ok = await confirm({ title: 'Delete slide', message: `Delete “${s.title}”? The app stops showing it.`, confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    if (await list.remove(s)) {
      auto.current = false;
      editor.close();
    }
  };

  const panelEditor = live ? { ...editor, slide: live } : editor;

  return (
    <div className="ui-page">
      <div className="hl-head">
        <p className="content-lede">Slides shown under the search bar on the app’s Home. Drag to reorder; the app shows live slides in this order.</p>
        {canEdit ? <Button onClick={create}>+ New slide</Button> : <ReadOnlyBadge />}
      </div>
      {list.status === 'stale' && <Banner tone="warning">Showing the last list we got. {list.error}</Banner>}
      {list.status === 'loading' && <TableSkeleton rows={5} />}
      {list.status === 'error' && <ErrorState message={list.error} offline={list.offline} onRetry={list.reload} />}
      {loaded && (
        <div className="hs-layout">
          <div className="hs-main">
            {list.slides.length === 0 ? (
              <Card>
                <EmptyState title="No slides yet" action={canEdit ? <Button onClick={create}>+ New slide</Button> : undefined}>
                  Add a slide and it shows on Home while it is switched on and inside its schedule.
                </EmptyState>
              </Card>
            ) : (
              <Card flush>
                <SlideTable slides={list.slides} selectedId={openId} canEdit={canEdit} names={targets.names} onSelect={select} onToggle={list.toggle} onMove={list.move} />
              </Card>
            )}
            <p className="feat-note feat-note--bare">
              A slide shows only while it is switched on and inside its schedule. Up to {MAX_LIVE} slides at once.
              {!canEdit && ' You can look at this page, not change it.'}
            </p>
          </div>
          {editor.open && wide && <aside className="hs-side"><SlidePanel editor={panelEditor} targets={targets} canEdit={canEdit} wide onDelete={askDelete} onRequestClose={close} /></aside>}
          {editor.open && !wide && <SlidePanel editor={panelEditor} targets={targets} canEdit={canEdit} wide={false} onDelete={askDelete} onRequestClose={close} />}
        </div>
      )}
    </div>
  );
}
