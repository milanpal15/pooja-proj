import { Badge, Button, Card, Modal, ReadOnlyList } from '../../../ui/index.js';
import { LANGUAGES, TARGET_TYPES, scheduleLabel, slideStatus, targetLabel } from '../lib/slide.js';
import { SlideForm } from './SlideForm.jsx';
import { SlidePreview } from './SlidePreview.jsx';

/** Read-only stand-in for the form: the preview and the facts as text. */
function SlideFacts({ editor, targets }) {
  const { draft, slide } = editor;
  const stored = slide || {};
  return (
    <div className="hs-form">
      <SlidePreview draft={draft} />
      <p className="ui-ro-note" role="note">View only. Your account can look at this but not change it.</p>
      <ReadOnlyList
        label="Slide details"
        rows={[
          { label: 'Title', value: draft.title },
          { label: 'Subtitle', value: draft.subtitle },
          { label: 'Tag', value: draft.tag },
          { label: 'Button text', value: draft.ctaLabel },
          { label: 'Opens', value: targetLabel({ type: draft.type, ref: draft.ref }, targets.names, stored.href) },
          { label: 'Schedule', value: scheduleLabel(stored) },
          { label: 'Language', value: LANGUAGES.find((l) => l.value === draft.language)?.label },
        ]}
      />
    </div>
  );
}

/**
 * The editor, in one of two frames: a sticky card beside the table (wide) or a
 * kit Modal (narrow). Same body and actions either way. Without `canEdit` it
 * shows the facts as text and no actions.
 */
export function SlidePanel({ editor, targets, canEdit, wide, onDelete, onRequestClose }) {
  const isNew = !editor.slide;
  const title = !canEdit ? 'Slide' : isNew ? 'New slide' : 'Edit slide';
  const st = editor.slide ? slideStatus({ ...editor.slide, enabled: editor.draft.enabled }) : null;
  const body = canEdit ? <SlideForm draft={editor.draft} set={editor.set} errors={editor.shown} targets={targets} /> : <SlideFacts editor={editor} targets={targets} />;
  const actions = canEdit && (
    <>
      {!isNew && (
        <Button variant="outline" className="hs-actions__delete" onClick={() => onDelete(editor.slide)}>
          Delete
        </Button>
      )}
      <Button loading={editor.saving} onClick={editor.save} className="hs-actions__save">
        Save slide
      </Button>
    </>
  );

  if (!wide) {
    return (
      <Modal
        open
        size="md"
        title={title}
        subtitle={undefined}
        onClose={onRequestClose}
        dismissible={!editor.saving}
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
