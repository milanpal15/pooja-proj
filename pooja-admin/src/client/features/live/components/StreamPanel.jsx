import { Badge, Button, Card, Modal, ReadOnlyList } from '../../../ui/index.js';
import { SOURCE_TYPES, clock, daysLabel, streamStatus } from '../lib/live.js';
import { StreamForm } from './StreamForm.jsx';

function StreamFacts({ draft, lookups }) {
  return (
    <div className="hs-form">
      <p className="ui-ro-note" role="note">View only. Your account can look at this but not change it.</p>
      <ReadOnlyList
        label="Stream details"
        rows={[
          { label: 'Temple', value: lookups.templeName(draft.templeSlug) },
          { label: 'Category', value: lookups.categoryName(draft.categorySlug) },
          { label: 'Jai button text', value: [draft.jaiText, draft.jaiTextHi].filter(Boolean).join(' / ') },
          { label: 'Source', value: SOURCE_TYPES.find((t) => t.value === draft.sourceType)?.label },
          { label: 'Link', value: draft.url },
          { label: 'Aartis', value: draft.aartis.map((a) => `${a.name} ${clock(a.time)} (${daysLabel(a.days)})`).join('; ') },
          { label: 'Chadhava listing', value: lookups.listings.find((l) => l.slug === draft.chadhavaListingSlug)?.title },
          { label: 'Pooja', value: lookups.poojas.find((p) => p.slug === draft.poojaSlug)?.title },
        ]}
      />
    </div>
  );
}

/** The editor in a sticky card (wide) or a kit Modal (narrow). Same body either way. */
export function StreamPanel({ editor, lookups, taken, canEdit, wide, onDelete, onRequestClose }) {
  const isNew = !editor.stream;
  const title = !canEdit ? 'Stream' : isNew ? 'New stream' : 'Edit stream';
  const st = editor.stream ? streamStatus({ ...editor.stream, enabled: editor.draft.enabled }) : null;
  const body = canEdit
    ? <StreamForm draft={editor.draft} set={editor.set} errors={editor.shown} lookups={lookups} stream={editor.stream} taken={taken} />
    : <StreamFacts draft={editor.draft} lookups={lookups} />;
  const actions = canEdit && (
    <>
      {!isNew && <Button variant="outline" className="hs-actions__delete" onClick={() => onDelete(editor.stream)}>Delete</Button>}
      <Button loading={editor.saving} onClick={editor.save} className="hs-actions__save">Save stream</Button>
    </>
  );
  if (!wide) {
    return (
      <Modal open size="md" title={title} onClose={onRequestClose} dismissible={!editor.saving}
        footer={canEdit ? actions : <Button variant="secondary" onClick={onRequestClose}>Close</Button>}>
        {body}
      </Modal>
    );
  }
  return (
    <Card flush className="hs-card">
      <header className="hs-panel__head">
        <h2>{title}</h2>
        {st && <Badge tone={st.tone}>{st.label}</Badge>}
      </header>
      <div className="hs-panel__body">{body}</div>
      {canEdit && <footer className="hs-panel__foot">{actions}</footer>}
    </Card>
  );
}
