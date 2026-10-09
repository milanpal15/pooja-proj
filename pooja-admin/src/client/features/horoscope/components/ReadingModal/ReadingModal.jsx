import { Button, Modal } from '../../../../ui/index.js';
import { longDate } from '../../../../lib/dates.js';
import { RASHIS } from '../../constants/rashis.js';
import { ReadingForm } from './ReadingForm.jsx';

/** The one place a reading is edited. Delete is the far-left action; a confirm dialog sits above it. */
export function ReadingModal({ editing, saving, onChange, onSave, onDelete, onClose }) {
  const sign = RASHIS.find((s) => s.value === editing.rashi);
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      lead={<span className="horo-hi">{sign?.hi}</span>}
      title={`${sign?.name} · ${sign?.en}`}
      subtitle={longDate(editing.date)}
      footerExtra={
        editing._id ? (
          <Button variant="danger" disabled={saving} onClick={onDelete}>
            Delete reading
          </Button>
        ) : null
      }
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={onSave}>
            Save reading
          </Button>
        </>
      }>
      <ReadingForm editing={editing} onChange={onChange} />
    </Modal>
  );
}
