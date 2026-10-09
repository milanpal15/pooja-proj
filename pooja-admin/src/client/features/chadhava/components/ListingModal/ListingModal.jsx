import { api } from '../../../../lib/api/index.js';
import { isoToLocalInput, localInputToIso } from '../../../../lib/dates.js';
import { useUpload } from '../../../../lib/hooks/useUpload.js';
import { Accordion, Button, Field, Modal, RepeatList, Switch, ThumbPick } from '../../../../ui/index.js';
import { GallerySection } from '../../../poojas/index.js';
import { OfferingsEditor } from './OfferingsEditor.jsx';

/** The only place a listing (and the offerings inside it) is written. */
export function ListingModal({ editor, refs, categories }) {
  const { draft, errors, saving, set } = editor;
  const { busy, upload } = useUpload();
  const isNew = !(draft._id || draft.id);
  const onBanner = async (file) => {
    const url = await upload(file, 'banner');
    if (url) set('banner', url);
  };
  return (
    <Modal
      open
      size="lg"
      onClose={editor.close}
      dismissible={!saving}
      title={isNew ? 'New listing' : 'Edit listing'}
      subtitle={isNew ? undefined : draft.title}
      footer={
        <>
          <Button variant="secondary" onClick={editor.close} disabled={saving}>
            Cancel
          </Button>
          <Button loading={saving} onClick={editor.save}>
            Save listing
          </Button>
        </>
      }>
      <div className="feat-grid2 feat-grid--top">
        <Field label="Title (English)" value={draft.title} error={errors.title} onChange={editor.setTitle} />
        <Field label="Title (Hindi)" value={draft.titleHi} onChange={(v) => set('titleHi', v)} />
      </div>
      <Field label="Slug (the listing’s address in the app)" value={draft.slug} error={errors.slug} readOnly={!isNew} hint={isNew ? undefined : 'Fixed once created, so links and orders keep working'} onChange={(v) => set('slug', v)} />
      <div className="feat-grid3 feat-grid--top">
        <Field type="select" label="Temple" value={draft.templeSlug} options={refs.temples} onChange={(v) => set('templeSlug', v)} />
        <Field label="Place shown" value={draft.place} onChange={(v) => set('place', v)} />
        <Field type="select" label="Category" value={draft.category} options={[{ value: '', label: '—' }, ...categories.map((c) => ({ value: c.slug, label: c.name || c.slug }))]} onChange={(v) => set('category', v)} />
      </div>
      <div className="feat-grid2 feat-grid--top">
        <Field type="datetime-local" label="Starts (optional)" value={isoToLocalInput(draft.startsAt)} onChange={(v) => set('startsAt', localInputToIso(v))} />
        <Field type="datetime-local" label="Ends (optional)" value={isoToLocalInput(draft.endsAt)} error={errors.endsAt} hint="Empty = always open" onChange={(v) => set('endsAt', localInputToIso(v))} />
      </div>
      <div className="ui-field">
        <span className="ui-field__label">Banner image</span>
        <ThumbPick label="banner" src={draft.banner ? api.asset(draft.banner) : ''} uploading={busy === 'banner'} onFile={onBanner} onClear={() => set('banner', '')} />
      </div>
      <Accordion title="Gallery" summary={`${draft.gallery.length} ${draft.gallery.length === 1 ? 'image' : 'images'}`}>
        <GallerySection gallery={draft.gallery} onChange={(g) => set('gallery', g)} />
      </Accordion>
      <Accordion title="Introduction and how it works" summary={`${draft.howItWorks.length} ${draft.howItWorks.length === 1 ? 'step' : 'steps'}`}>
        <Field type="textarea" rows={4} label="Introduction (English)" value={draft.intro} onChange={(v) => set('intro', v)} />
        <Field type="textarea" rows={4} label="Introduction (Hindi)" value={draft.introHi} onChange={(v) => set('introHi', v)} />
        <RepeatList noun="step" items={draft.howItWorks} onChange={(v) => set('howItWorks', v)} blank={() => ({ text: '', textHi: '' })} fields={[{ key: 'text', label: 'Text (English)' }, { key: 'textHi', label: 'Text (Hindi)' }]} />
      </Accordion>
      <section className="pj-block">
        <h3 className="pj-block__title">Offerings, priced in coins</h3>
        <OfferingsEditor editor={editor} />
      </section>
      <Switch variant="card" label="Visible in the app" checked={!!draft.enabled} onChange={(v) => set('enabled', v)} />
    </Modal>
  );
}
