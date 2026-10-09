import { Button, Modal } from '../../../../ui/index.js';
import { nameOf } from '../../lib/sources.js';
import { SectionForm } from './SectionForm.jsx';

/** The only place a Home block is written. Esc / ✕ / scrim close it; not while a save is in flight. */
export function SectionModal({ editor, onDelete }) {
  const { draft, errors, saving, close, set, save } = editor;
  const isNew = !draft._id && !draft.id;
  const removable = !isNew && draft.source === 'custom';
  return (
    <Modal
      open
      size="lg"
      onClose={close}
      dismissible={!saving}
      title={isNew ? 'New section' : 'Edit section'}
      subtitle={isNew ? undefined : nameOf(draft)}
      footerExtra={
        removable && (
          <Button variant="danger" disabled={saving} onClick={() => onDelete(draft)}>
            Delete section
          </Button>
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Save section
          </Button>
        </>
      }>
      <SectionForm section={draft} errors={errors} set={set} />
    </Modal>
  );
}
