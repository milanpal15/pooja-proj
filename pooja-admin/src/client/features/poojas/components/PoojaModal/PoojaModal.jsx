import { Banner, Button, Modal } from '../../../../ui/index.js';
import { BasicsSection } from './BasicsSection.jsx';
import { ContentSections } from './ContentSections.jsx';
import { GallerySection } from './GallerySection.jsx';
import { PackagesSection } from './PackagesSection.jsx';

const Section = ({ title, children }) => (
  <section className="pj-block">
    <h3 className="pj-block__title">{title}</h3>
    {children}
  </section>
);

/** The only place a pooja is written. Closing with unsaved edits asks first; not closable mid-save. */
export function PoojaModal({ editor, refs }) {
  const { draft, errors, saving } = editor;
  const isNew = !(draft._id || draft.id);
  const busy = !!saving;
  return (
    <Modal
      open
      size="xl"
      onClose={editor.close}
      dismissible={!busy}
      title={isNew ? 'New pooja' : 'Edit pooja'}
      subtitle={isNew ? undefined : draft.title}
      footer={
        <>
          <Button variant="secondary" onClick={editor.close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="outline" loading={saving === 'draft'} disabled={busy} onClick={() => editor.save(false)}>
            Save as draft
          </Button>
          <Button loading={saving === 'publish'} disabled={busy} onClick={() => editor.save(true)}>
            Save and publish
          </Button>
        </>
      }>
      <div className="pj-cols">
        <div className="pj-col">
          <Section title="Basics">
            <BasicsSection draft={draft} errors={errors} refs={refs} isNew={isNew} set={editor.set} setTitle={editor.setTitle} />
          </Section>
          <Section title="Gallery">
            <GallerySection gallery={draft.gallery} onChange={(g) => editor.set('gallery', g)} />
          </Section>
        </div>
        <div className="pj-col">
          <Section title="Packages, priced in coins">
            <PackagesSection editor={editor} />
          </Section>
          <Section title="Page content">
            <ContentSections draft={draft} set={editor.set} />
            <Banner tone="warning">Reviews and ratings are not edited here. They come from devotees whose booking for this pooja was performed, and can be hidden in Bookings.</Banner>
          </Section>
        </div>
      </div>
    </Modal>
  );
}
