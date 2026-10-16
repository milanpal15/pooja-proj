import { useState } from 'react';

import { ConfirmDialog, Field } from '../../../ui/index.js';

/** Publish confirmation with an optional note for the history. */
export function PublishDialog({ open, unsaved, blockCount, busy, onConfirm, onCancel }) {
  const [note, setNote] = useState('');
  return (
    <ConfirmDialog
      open={open}
      title="Publish this layout"
      confirmLabel="Publish"
      busy={busy}
      onCancel={onCancel}
      onConfirm={() => onConfirm(note.trim())}
      message={(
        <div className="hl2-fields">
          <p>Every phone gets these {blockCount} blocks on its next refresh (within about a minute). The current live layout stays in History, so you can roll back.{unsaved ? ' Your unsaved changes are saved to the draft first.' : ''}</p>
          <Field label="Note (optional)" value={note} placeholder="What changed, e.g. Diwali banner on top" maxLength={200} onChange={setNote} />
        </div>
      )}
    />
  );
}
