import { useEffect, useMemo, useRef, useState } from 'react';

import { useAccess } from '../../../lib/access/index.js';
import { idOf } from '../../../lib/ids.js';
import { Banner, Button, Card, EmptyState, ErrorState, Field, TableSkeleton, useConfirm } from '../../../ui/index.js';
import { useStreamEditor } from '../hooks/useStreamEditor.js';
import { useStreams } from '../hooks/useStreams.js';
import { useWide } from '../hooks/useWide.js';
import { streamStatus } from '../lib/live.js';
import { StreamPanel } from './StreamPanel.jsx';
import { StreamTable } from './StreamTable.jsx';

const STATUS = [
  { value: '', label: 'Status: All' },
  { value: 'live', label: 'Live' },
  { value: 'upcoming', label: 'Starts later' },
  { value: 'offline', label: 'Source offline' },
  { value: 'hidden', label: 'Hidden' },
];

/** Streams: search + filters, the table, and the editor beside it (wide) or over it (narrow). */
export function StreamsTab({ area, lookups, addRef }) {
  const canEdit = useAccess().canEdit(area);
  const confirm = useConfirm();
  const wide = useWide();
  const list = useStreams();
  const editor = useStreamEditor({ streams: list.streams, onSaved: list.reload });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [cat, setCat] = useState('');
  const openId = editor.stream ? idOf(editor.stream) : null;
  const loaded = list.status === 'ready' || list.status === 'stale';

  const shown = useMemo(
    () =>
      list.streams.filter((s) => {
        const name = lookups.templeName(s.templeSlug).toLowerCase();
        return (!q || name.includes(q.trim().toLowerCase())) && (!status || streamStatus(s).key === status) && (!cat || s.categorySlug === cat);
      }),
    [list.streams, q, status, cat, lookups],
  );

  const auto = useRef(false);
  useEffect(() => {
    if (wide && loaded && !auto.current && list.streams.length && !editor.open) {
      auto.current = true;
      editor.begin(list.streams[0]);
    }
  }, [wide, loaded, list.streams, editor]);

  const discardOk = async () => !editor.dirty || confirm({ title: 'Discard changes', message: 'This stream has unsaved changes.', confirmLabel: 'Discard', tone: 'danger' });
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
    const ok = await confirm({ title: 'Delete stream', message: `Delete the stream for “${lookups.templeName(s.templeSlug)}”? The app stops listing it.`, confirmLabel: 'Delete', tone: 'danger' });
    if (ok && (await list.remove(s))) {
      auto.current = false;
      editor.close();
    }
  };
  if (addRef) addRef.current = create;

  // Keep the open stream's live fields (status, viewers) in step with the table.
  const fresh = editor.stream && list.streams.find((s) => idOf(s) === openId);
  const panelEditor = fresh ? { ...editor, stream: { ...editor.stream, ...fresh } } : editor;
  const taken = list.streams.filter((s) => idOf(s) !== openId).map((s) => s.templeSlug);

  return (
    <>
      {list.status === 'stale' && <Banner tone="warning">Showing the last list we got. {list.error}</Banner>}
      {list.status === 'loading' && <TableSkeleton rows={5} />}
      {list.status === 'error' && <ErrorState message={list.error} offline={list.offline} onRetry={list.reload} />}
      {loaded && (
        <div className="hs-layout">
          <div className="hs-main">
            <div className="lv-filters">
              <Field label="Search temple" hideLabel type="search" placeholder="Search temple" value={q} onChange={setQ} />
              <Field label="Status" hideLabel type="select" value={status} options={STATUS} onChange={setStatus} />
              <Field label="Category" hideLabel type="select" value={cat} onChange={setCat}>
                <option value="">Category: All</option>
                {lookups.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </Field>
            </div>
            {list.streams.length === 0 ? (
              <Card>
                <EmptyState title="No streams yet" action={canEdit ? <Button onClick={create}>+ Add stream</Button> : undefined}>
                  Add a temple stream and it shows in the app’s Live Darshan list.
                </EmptyState>
              </Card>
            ) : shown.length === 0 ? (
              <Card><EmptyState title="No streams match">Change the search or the filters.</EmptyState></Card>
            ) : (
              <Card flush>
                <StreamTable streams={shown} lookups={lookups} selectedId={openId} canEdit={canEdit} onSelect={select} onToggle={list.toggle} />
              </Card>
            )}
            <p className="feat-note feat-note--bare">
              Source offline: the switch is on but nothing is broadcasting, so the app shows the temple’s next aarti time instead of a player. Viewer counts are read from the stream, never typed.
              A stream marked “not verified” is Live only because it is switched on; its source cannot report whether it is broadcasting.
              {!canEdit && ' You can look at this page, not change it.'}
            </p>
          </div>
          {editor.open && wide && <aside className="hs-side"><StreamPanel editor={panelEditor} lookups={lookups} taken={taken} canEdit={canEdit} wide onDelete={askDelete} onRequestClose={close} /></aside>}
          {editor.open && !wide && <StreamPanel editor={panelEditor} lookups={lookups} taken={taken} canEdit={canEdit} wide={false} onDelete={askDelete} onRequestClose={close} />}
        </div>
      )}
    </>
  );
}
