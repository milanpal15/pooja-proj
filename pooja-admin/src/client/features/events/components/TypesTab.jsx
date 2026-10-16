import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { idOf } from '../../../lib/ids.js';
import { Badge, Button, Card, EmptyState, Field, Modal, ReadOnlyList, Switch, useConfirm, useToast } from '../../../ui/index.js';
import { BLOCKS, ORDERS, REG_MODES, SCHEDULE_MODES } from '../lib/events.js';
import { blankType, typeBody, typeDraft, validateType } from '../lib/types.js';

const blockName = (id) => BLOCKS.find((b) => b.id === id)?.label || id;

/** Event types: presets that prefill the editor. They never change how an event behaves. */
export function TypesTab({ canEdit, lookups, addRef }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(null); // { type|null, draft }
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const types = lookups.types;
  const begin = (type) => { setTried(false); setEdit({ type, draft: type ? typeDraft(type) : blankType() }); };
  if (addRef) addRef.current = () => begin(null);
  const set = (p) => setEdit((s) => ({ ...s, draft: { ...s.draft, ...p } }));
  const taken = types.filter((t) => t !== edit?.type).map((t) => t.slug);
  const errors = edit ? validateType(edit.draft, { taken: edit.type ? [] : taken }) : {};

  const save = async () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const body = typeBody(edit.draft, edit.type, types);
      if (edit.type) await api.eventTypes.update(idOf(edit.type), body);
      else await api.eventTypes.create(body);
      toast.success(edit.type ? 'Event type saved' : 'Event type added');
      setEdit(null);
      await lookups.reloadTypes();
    } catch (e) {
      toast.error(`Could not save. ${e.message}`);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (ty) => {
    if (!(await confirm({ title: 'Delete event type', message: `Delete “${ty.name}”? A type that has events cannot be deleted; switch it off instead.`, confirmLabel: 'Delete type', tone: 'danger' }))) return;
    try {
      await api.eventTypes.remove(idOf(ty));
      toast.success('Event type deleted');
      setEdit(null);
      await lookups.reloadTypes();
    } catch (e) {
      toast.error(e.code === 'in_use' ? `“${ty.name}” has events, so it cannot be deleted. Switch it off instead.` : `Could not delete. ${e.message}`);
    }
  };
  const toggle = async (ty) => {
    try {
      await api.eventTypes.update(idOf(ty), { enabled: ty.enabled === false });
      toast.success(ty.enabled === false ? 'Event type turned on' : 'Event type turned off');
      await lookups.reloadTypes();
    } catch (e) {
      toast.error(`Could not change that. ${e.message}`);
    }
  };
  const d = edit?.draft;

  return (
    <>
      <p className="feat-note feat-note--bare">A type is a preset: a name, a colour and the sections a new event starts with. Nothing in the app or the server behaves differently because of it, so you can make any kind of event.</p>
      {types.length === 0 ? (
        <Card><EmptyState title="No event types yet" action={canEdit ? <Button onClick={() => begin(null)}>+ New type</Button> : undefined}>Add a type such as Vrat or Talk, then create events from it.</EmptyState></Card>
      ) : (
        <div className="ev-types">
          {types.map((ty) => (
            <article key={idOf(ty) || ty.slug} className="ui-card ev-type" style={{ '--ev': ty.color || 'var(--primary)' }}>
              <header className="ev-type__head">
                <span className="ev-type__dot" aria-hidden="true" />
                <h3>{ty.name}</h3>
                {ty.enabled === false && <Badge tone="neutral">Off</Badge>}
                <span className="ev-type__count">{ty.eventCount == null ? '' : `${ty.eventCount} ${ty.eventCount === 1 ? 'event' : 'events'}`}</span>
              </header>
              <p className="ev-type__desc">{ty.description || '—'}</p>
              <div className="ev-type__tags">
                {(ty.defaults?.blocks || []).map((b) => <span key={b} className="ev-tag">{blockName(b)}</span>)}
              </div>
              <footer className="ev-type__foot">
                {canEdit ? (
                  <>
                    <Switch label={`Offer ${ty.name} for new events`} checked={ty.enabled !== false} onChange={() => toggle(ty)} />
                    <Button variant="outline" size="sm" onClick={() => begin(ty)}>Edit</Button>
                  </>
                ) : <Button variant="outline" size="sm" onClick={() => begin(ty)}>View</Button>}
              </footer>
            </article>
          ))}
        </div>
      )}
      {edit && !canEdit && (
        <Modal open size="sm" title={edit.type.name} onClose={() => setEdit(null)} footer={<Button variant="secondary" onClick={() => setEdit(null)}>Close</Button>}>
          <p className="ui-ro-note" role="note">View only. Your account can look at this but not change it.</p>
          <ReadOnlyList label="Event type" rows={[
            { label: 'Name', value: [d.name, d.nameHi].filter(Boolean).join(' / ') },
            { label: 'Description', value: d.description },
            { label: 'Starts with', value: d.blocks.map(blockName).join(', ') },
          ]} />
        </Modal>
      )}
      {edit && canEdit && (
        <Modal open size="md" title={edit.type ? 'Edit event type' : 'New event type'} onClose={() => setEdit(null)} dismissible={!saving}
          footerExtra={edit.type ? <Button variant="danger" onClick={() => remove(edit.type)}>Delete</Button> : undefined}
          footer={<Button loading={saving} onClick={save}>Save type</Button>}>
          <div className="hs-form">
            <div className="hs-pair">
              <Field label="Name" value={d.name} error={tried ? errors.name : undefined} onChange={(v) => set({ name: v })} />
              <Field label="Name (Hindi)" value={d.nameHi} onChange={(v) => set({ nameHi: v })} />
            </div>
            <div className="hs-pair">
              <Field label="Colour" hint="A hex value, used for the type’s chip and as the default event colour" value={d.color} error={tried ? errors.color : undefined} onChange={(v) => set({ color: v })} />
              <div className="ev-swatch" style={{ background: /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : 'transparent' }} role="img" aria-label="Colour preview" />
            </div>
            <Field label="Description" type="textarea" value={d.description} onChange={(v) => set({ description: v })} />
            <section className="hs-block">
              <h3 className="hs-block__title">New events start with</h3>
              <div className="ev-checks">
                {BLOCKS.map((b) => (
                  <label key={b.id} className="ev-check">
                    <input type="checkbox" checked={d.blocks.includes(b.id)} onChange={(e) => set({ blocks: e.target.checked ? BLOCKS.map((x) => x.id).filter((x) => x === b.id || d.blocks.includes(x)) : d.blocks.filter((x) => x !== b.id) })} />
                    {b.label}
                  </label>
                ))}
              </div>
              {d.blocks.includes('schedule') && <Field label="Schedule" type="select" value={d.scheduleMode} options={SCHEDULE_MODES} onChange={(v) => set({ scheduleMode: v })} />}
              {d.blocks.includes('registration') && <Field label="Joining" type="select" value={d.regMode === 'none' ? 'free' : d.regMode} options={REG_MODES.filter((m) => m.value !== 'none')} onChange={(v) => set({ regMode: v })} />}
              {d.blocks.includes('milestones') && <Field label="Milestone order" type="select" value={d.order} options={ORDERS} onChange={(v) => set({ order: v })} />}
            </section>
            <Switch variant="card" label="Offer this type for new events" checked={d.enabled} onChange={(v) => set({ enabled: v })} />
          </div>
        </Modal>
      )}
    </>
  );
}
