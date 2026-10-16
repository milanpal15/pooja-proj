import { useMemo, useState } from 'react';

import { useAccess } from '../../lib/access/index.js';
import { Banner, Button, ErrorState, ReadOnlyBadge, TableSkeleton, Tabs, useConfirm } from '../../ui/index.js';
import { AddBlockModal } from './components/AddBlockModal.jsx';
import { BlockForm } from './components/BlockForm.jsx';
import { BlockList } from './components/BlockList.jsx';
import { BuilderContext } from './components/BuilderContext.js';
import { ErrorsBanner } from './components/ErrorsBanner.jsx';
import { HistoryModal } from './components/HistoryModal.jsx';
import { JsonTab } from './components/JsonTab.jsx';
import { PhonePreview } from './components/PhonePreview.jsx';
import { PublishDialog } from './components/PublishDialog.jsx';
import { StatusBar } from './components/StatusBar.jsx';
import { useHomeLayout } from './hooks/useHomeLayout.js';
import { useLookups } from './hooks/useLookups.js';
import { selectionAfterRemove } from './lib/layout.js';

const TABS = [
  { id: 'builder', label: 'Builder' },
  { id: 'json', label: 'JSON' },
];

/**
 * Home layout (docs/HOME_LAYOUT.md §7): the whole Home screen as an ordered list
 * of blocks. Left, the list; centre, a schematic phone drawn from the JSON;
 * right, the selected block's form, generated from the server's registry.
 * Edits are a DRAFT: Save keeps it, Publish makes it live, History rolls back.
 * `area` (content) decides whether this account may write.
 */
export function HomeLayoutPage({ area }) {
  const canEdit = useAccess().canEdit(area);
  const confirm = useConfirm();
  const h = useHomeLayout();
  const lookups = useLookups();
  const [tab, setTab] = useState('builder');
  const [selected, setSelected] = useState(null);
  const [lang, setLang] = useState('en');
  const [adding, setAdding] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [history, setHistory] = useState(false);
  const [jsonText, setJsonText] = useState(null); // null = follows the builder

  const { doc, reg } = h;
  const block = doc.blocks.find((b) => b.id === selected) || null;
  const errorsForBlock = block ? h.errors.byBlock[block.id] || {} : {};
  const builder = useMemo(() => ({ reg, lookups, ro: !canEdit, errors: errorsForBlock }), [reg, lookups, canEdit, errorsForBlock]);

  if (h.load.status === 'loading') return <div className="ui-page"><TableSkeleton rows={8} /></div>;
  if (h.load.status === 'error') return <div className="ui-page"><ErrorState message={h.load.error} offline={h.load.offline} onRetry={h.reload} /></div>;

  const differs = h.meta.dirty;
  const select = (id) => { setSelected(id); setTab('builder'); };

  const add = (type) => {
    setAdding(false);
    setSelected(h.add(type, selected));
  };
  const askDelete = async (id) => {
    const b = doc.blocks.find((x) => x.id === id);
    const ok = await confirm({ title: 'Delete block', message: `Delete “${b?.title || reg.typeMap[b?.type]?.title || b?.type}”? It leaves the draft; nothing changes on phones until you publish.`, confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    if (selected === id) setSelected(selectionAfterRemove(doc.blocks, id));
    h.remove(id);
  };
  const duplicate = (id) => { const nid = h.duplicate(id); if (nid) setSelected(nid); };
  const askReset = async () => {
    const ok = await confirm({ title: 'Reset to the built-in default', message: `The draft is replaced by the standard Home layout${h.unsaved ? ', and your unsaved changes are lost' : ''}. The live layout does not change until you publish.`, confirmLabel: 'Reset draft', tone: 'danger' });
    if (ok && (await h.resetDefault())) { setSelected(null); setJsonText(null); }
  };
  const askRollback = async (version, unsaved) => {
    const ok = await confirm({ title: `Roll back to version ${version}`, message: `Version ${version} becomes your draft${unsaved ? ', replacing your unsaved changes' : ', replacing the current draft'}. It is not published until you publish it.`, confirmLabel: 'Roll back to draft', tone: unsaved ? 'danger' : 'default' });
    if (ok && (await h.rollback(version))) { setHistory(false); setSelected(null); setJsonText(null); }
  };
  const doPublish = async (note) => {
    await h.publish(note);
    setPublishing(false);
  };
  const jsonDirty = jsonText !== null;

  return (
    <div className="ui-page hl2">
      <div className="hl-head">
        <p className="content-lede">Every band of the app’s Home screen is a block in this list. Edit the draft here, then publish it; phones pick the new layout up within a minute, no release needed. The Home slider has its own tab.</p>
        {!canEdit && <ReadOnlyBadge />}
      </div>
      <StatusBar canEdit={canEdit} unsaved={h.unsaved} differs={differs} meta={h.meta} busy={h.busy} onSave={h.save} onPublish={() => setPublishing(true)} onHistory={() => setHistory(true)} onReset={askReset} />
      {h.notes.map((n) => <Banner key={n} tone="warning">{n}</Banner>)}
      {jsonDirty && tab === 'builder' && <Banner tone="info" action={<Button variant="outline" size="sm" onClick={() => setTab('json')}>Open JSON</Button>}>The JSON tab has text you have not applied to the builder.</Banner>}
      <ErrorsBanner entries={h.errors.active} global={h.errors.global} blocks={doc.blocks} onSelect={select} />
      <Tabs label="Home layout views" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'json' ? (
        <JsonTab doc={doc} reg={reg} text={jsonText} onText={setJsonText} canEdit={canEdit} busy={h.busy} onApply={h.replace} onValidate={h.validate} />
      ) : (
        <BuilderContext.Provider value={builder}>
          <div className="hl2-grid">
            <BlockList
              blocks={doc.blocks} reg={reg} selectedId={selected} canEdit={canEdit} errorsByBlock={h.errors.byBlock}
              onSelect={setSelected} onToggle={(id, v) => h.patch(id, { enabled: v })} onMove={h.move} onDuplicate={duplicate} onDelete={askDelete} onAdd={() => setAdding(true)}
            />
            <PhonePreview blocks={doc.blocks} reg={reg} selectedId={selected} lang={lang} onLang={setLang} onSelect={setSelected} />
            <div className="hl2-side">
              {block ? <BlockForm key={block.id} block={block} onChange={(p) => h.patch(block.id, p)} /> : (
                <div className="hl2-side__empty">
                  <b>{doc.blocks.length ? 'Select a block' : 'No blocks yet'}</b>
                  <span>{doc.blocks.length ? 'Pick one in the list or on the phone to edit it.' : canEdit ? 'Add the first block to start.' : ''}</span>
                </div>
              )}
            </div>
          </div>
        </BuilderContext.Provider>
      )}
      {adding && <AddBlockModal reg={reg} onPick={add} onClose={() => setAdding(false)} />}
      <PublishDialog open={publishing} key={String(publishing)} unsaved={h.unsaved} blockCount={doc.blocks.length} busy={h.busy === 'publish'} onConfirm={doPublish} onCancel={() => setPublishing(false)} />
      {history && <HistoryModal meta={h.meta} draft={doc} canEdit={canEdit} unsaved={h.unsaved} busy={h.busy} onRollback={askRollback} onClose={() => setHistory(false)} />}
    </div>
  );
}
