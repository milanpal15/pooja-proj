import { useMemo, useState } from 'react';

import { useAccess } from '../../lib/access/index.js';
import { Banner, Button, ErrorState, TableSkeleton, Tabs, useConfirm } from '../../ui/index.js';
import { AddBlockModal } from './components/AddBlockModal.jsx';
import { BlockForm, FOOTNOTE, FixedForm } from './components/BlockForm.jsx';
import { BuilderContext } from './components/BuilderContext.js';
import { ErrorsBanner } from './components/ErrorsBanner.jsx';
import { HistoryModal } from './components/HistoryModal.jsx';
import { JsonTab } from './components/JsonTab.jsx';
import { LayoutBar, LayoutTabs, PreviewAsModal } from './components/LayoutTabs.jsx';
import { LayoutDialog } from './components/LayoutDialog.jsx';
import { PageHeader } from './components/PageHeader.jsx';
import { PhonePreview } from './components/PhonePreview.jsx';
import { PublishDialog } from './components/PublishDialog.jsx';
import { FIXED_ID, SectionList } from './components/SectionList.jsx';
import { useHomeLayout } from './hooks/useHomeLayout.js';
import { useLookups } from './hooks/useLookups.js';
import { PRESETS, personaLabel, servedLayout } from './lib/audience.js';
import { blockKey } from './lib/errors.js';
import { selectionAfterRemove } from './lib/layout.js';

const TABS = [
  { id: 'builder', label: 'Builder' },
  { id: 'json', label: 'JSON' },
];
const NONE = {};

/**
 * Home layout (docs/HOME_LAYOUT.md §9.4): named layouts (each a whole Home), and per layout an ordered list of
 * sections. Left, the sections; centre, a schematic phone for the chosen "Preview as" person; right, the selected
 * section's form, generated from the server's registry. Edits are a DRAFT: Save keeps it, Publish makes it live,
 * Discard returns to the live set, Version history rolls back. `area` (content) decides whether this account may write.
 */
export function HomeLayoutPage({ area }) {
  const canEdit = useAccess().canEdit(area);
  const confirm = useConfirm();
  const h = useHomeLayout();
  const lookups = useLookups();
  const [tab, setTab] = useState('builder');
  const [selected, setSelected] = useState(null);
  const [persona, setPersona] = useState(PRESETS[0]);
  const [adding, setAdding] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [history, setHistory] = useState(false);
  const [dialog, setDialog] = useState(null); // 'new' | 'rename' | 'schedule'
  const [asking, setAsking] = useState(false); // "Preview as" → Custom…
  const [jsonText, setJsonText] = useState(null); // null = follows the builder

  const { doc, reg, active, fixed } = h;
  const blocks = active?.blocks || [];
  const now = Date.now();
  const valid = (selected === FIXED_ID && fixed > 0) || blocks.some((b) => b.id === selected);
  const sel = valid ? selected : blocks[fixed]?.id ?? (fixed > 0 ? FIXED_ID : null);
  const block = blocks.find((b) => b.id === sel) || null;
  const errorsOf = (id) => (active ? h.errors.blocks[blockKey(active.id, id)] : null) || NONE;
  const builder = useMemo(() => ({ reg, lookups, ro: !canEdit, errors: block ? errorsOf(block.id) : NONE }), [reg, lookups, canEdit, block, h.errors.blocks, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const served = useMemo(() => (active ? servedLayout(doc, persona, now, reg.audiences.map((a) => a.key)) : null), [doc, persona, active, reg]); // eslint-disable-line react-hooks/exhaustive-deps

  if (h.load.status === 'loading') return <div className="ui-page"><TableSkeleton rows={8} /></div>;
  if (h.load.status === 'error') return <div className="ui-page"><ErrorState message={h.load.error} offline={h.load.offline} onRetry={h.reload} /></div>;
  if (!active) return <div className="ui-page"><ErrorState message="The server sent no layouts." onRetry={h.reload} /></div>;

  const changes = h.meta.changes;
  const select = (layoutId, id) => { if (layoutId && layoutId !== active.id) h.setActive(layoutId); if (id) setSelected(id); setTab('builder'); };
  const pickLayout = (id) => { h.setActive(id); setSelected(null); };

  const add = (type) => {
    setAdding(false);
    const after = sel && sel !== FIXED_ID ? sel : blocks[fixed - 1]?.id;
    setSelected(h.add(type, after));
  };
  const askRemove = async () => {
    if (!block) return;
    const ok = await confirm({ title: 'Remove section', message: `Remove “${block.title || reg.typeMap[block.type]?.title || block.type}” from “${active.name}”? It leaves the draft; nothing changes on phones until you publish.`, confirmLabel: 'Remove', tone: 'danger' });
    if (!ok) return;
    setSelected(selectionAfterRemove(blocks, block.id));
    h.remove(block.id);
  };
  const duplicate = () => { const nid = h.duplicate(block.id); if (nid) setSelected(nid); };

  const askDiscard = async () => {
    const ok = await confirm({ title: 'Discard the draft', message: `The draft goes back to what is live now${h.unsaved ? ', and your unsaved edits are lost' : changes ? `, dropping ${changes} ${changes === 1 ? 'change' : 'changes'}` : ''}. Nothing changes on phones.`, confirmLabel: 'Discard draft', tone: 'danger' });
    if (ok && (await h.discard())) { setSelected(null); setJsonText(null); }
  };
  const askReset = async () => {
    const ok = await confirm({ title: 'Reset to the built-in default', message: `The draft becomes a single default layout with the standard Home${h.unsaved ? ', and your unsaved changes are lost' : ''}. Every other layout leaves the draft. The live set does not change until you publish.`, confirmLabel: 'Reset draft', tone: 'danger' });
    if (ok && (await h.resetDefault())) { setHistory(false); setSelected(null); setJsonText(null); }
  };
  const askRollback = async (version, unsaved) => {
    const ok = await confirm({ title: `Roll back to version ${version}`, message: `Version ${version} becomes your draft${unsaved ? ', replacing your unsaved changes' : ', replacing the current draft'}. It is not published until you publish it.`, confirmLabel: 'Roll back to draft', tone: unsaved ? 'danger' : 'default' });
    if (ok && (await h.rollback(version))) { setHistory(false); setSelected(null); setJsonText(null); }
  };
  const askDeleteLayout = async () => {
    const ok = await confirm({ title: 'Delete layout', message: `Delete “${active.name}” and its ${blocks.length} sections from the draft? People it was for see the default layout once you publish.`, confirmLabel: 'Delete layout', tone: 'danger' });
    if (ok) { h.deleteLayout(active.id); setSelected(null); }
  };
  const submitDialog = (v) => {
    if (dialog === 'new') { if (h.createLayout(v)) { setSelected(null); setDialog(null); } return; }
    h.updateLayout(active.id, dialog === 'rename' ? { name: v.name } : { name: v.name, enabled: v.enabled, audience: v.audience, startsAt: v.startsAt, endsAt: v.endsAt });
    setDialog(null);
  };
  const doDuplicateLayout = () => { if (h.duplicateLayout(active.id)) setSelected(null); };
  const doPublish = async (note) => {
    await h.publish(note);
    setPublishing(false);
  };

  const note = served && served.id !== active.id ? `${personaLabel(persona, reg)} would be shown “${served.name}”, not this layout.` : '';
  const jsonDirty = jsonText !== null;

  return (
    <div className="ui-page hl3">
      <PageHeader canEdit={canEdit} unsaved={h.unsaved} changes={changes} busy={h.busy} onSave={h.save} onPublish={() => setPublishing(true)} onHistory={() => setHistory(true)} onDiscard={askDiscard} />
      {h.notes.map((n) => <Banner key={n} tone="warning">{n}</Banner>)}
      {jsonDirty && tab === 'builder' && <Banner tone="info" action={<Button variant="outline" size="sm" onClick={() => setTab('json')}>Open JSON</Button>}>The JSON tab has text you have not applied to the builder.</Banner>}
      <ErrorsBanner entries={h.errors.entries} global={h.errors.global} doc={doc} reg={reg} onSelect={select} />
      <Tabs label="Home layout views" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'json' ? (
        <JsonTab doc={doc} reg={reg} text={jsonText} onText={setJsonText} canEdit={canEdit} busy={h.busy} onApply={h.replace} onValidate={h.validate} />
      ) : (
        <>
          <LayoutTabs layouts={h.layouts} activeId={active.id} now={now} canEdit={canEdit} persona={persona} onPersona={setPersona} onCustom={() => setAsking(true)} onSelect={pickLayout} onNew={() => setDialog('new')} />
          <LayoutBar layout={active} doc={doc} reg={reg} now={now} canEdit={canEdit} onRename={() => setDialog('rename')} onSchedule={() => setDialog('schedule')} onDuplicate={doDuplicateLayout} onDelete={askDeleteLayout} onMove={(d) => h.moveLayout(active.id, d)} />
          <BuilderContext.Provider value={builder}>
            <div className="hl3-grid">
              <SectionList
                blocks={blocks} reg={reg} fixed={fixed} selectedId={sel} canEdit={canEdit} errorsOf={errorsOf} persona={persona} now={now}
                onSelect={setSelected} onToggle={(id, v) => h.patch(id, { enabled: v })} onMove={h.move} onMoveTo={h.moveTo} onAdd={() => setAdding(true)}
              />
              <PhonePreview blocks={blocks} reg={reg} fixed={fixed} selectedId={sel} persona={persona} onSelect={setSelected} note={note} />
              <div className="hl3-card hl3-side">
                {sel === FIXED_ID ? (
                  <FixedForm blocks={blocks.slice(0, fixed)} errorsFor={errorsOf} onChange={h.patch} />
                ) : block ? (
                  <BlockForm key={`${active.id}/${block.id}`} block={block} onChange={(p) => h.patch(block.id, p)} onDuplicate={duplicate} onRemove={askRemove} />
                ) : (
                  <div className="hl2-side__empty">
                    <b>{blocks.length ? 'Select a section' : 'No sections yet'}</b>
                    <span>{blocks.length ? 'Pick one in the list or on the phone to edit it.' : canEdit ? 'Add the first section to start.' : ''}</span>
                    <p className="hl3-note">{FOOTNOTE}</p>
                  </div>
                )}
              </div>
            </div>
          </BuilderContext.Provider>
        </>
      )}
      {adding && <AddBlockModal reg={reg} onPick={add} onClose={() => setAdding(false)} />}
      {dialog && <LayoutDialog key={`${dialog}/${active.id}`} mode={dialog} layout={active} layouts={h.layouts} reg={reg} onSubmit={submitDialog} onClose={() => setDialog(null)} />}
      {asking && <PreviewAsModal persona={persona} reg={reg} onChange={setPersona} onClose={() => setAsking(false)} />}
      <PublishDialog open={publishing} key={String(publishing)} unsaved={h.unsaved} layoutCount={doc.layouts.length} changes={h.unsaved ? 0 : changes} busy={h.busy === 'publish'} onConfirm={doPublish} onCancel={() => setPublishing(false)} />
      {history && <HistoryModal meta={h.meta} draft={doc} canEdit={canEdit} unsaved={h.unsaved} busy={h.busy} onRollback={askRollback} onReset={askReset} onClose={() => setHistory(false)} />}
    </div>
  );
}
