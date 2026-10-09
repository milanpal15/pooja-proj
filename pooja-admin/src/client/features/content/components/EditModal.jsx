import { Button, Modal } from '../../../ui/index.js';
import { FieldList } from './FieldList.jsx';

/** The only place content is written. Esc / ✕ / scrim close it; not while a save is in flight. */
export function EditModal({ title, fields, values, uploading, saving, onChange, onFile, onSave, onClose }) {
  return (
    <Modal
      open
      onClose={onClose}
      title={values._id ? `Edit ${title}` : `New ${title}`}
      dismissible={!saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button loading={saving} onClick={onSave}>
            Save
          </Button>
        </>
      }>
      <FieldList fields={fields} values={values} onChange={onChange} uploading={uploading} onFile={onFile} />
    </Modal>
  );
}
