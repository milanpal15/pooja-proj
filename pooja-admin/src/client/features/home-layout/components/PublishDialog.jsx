import { useState } from 'react';

import { ConfirmDialog, Field } from '../../../ui/index.js';

/** Publish confirmation with an optional note for the history. */
export function PublishDialog({ open, unsaved, layoutCount, changes, busy, onConfirm, onCancel }) {
  const [note, setNote] = useState('');
  return (
    <ConfirmDialog
      open={open}
      title="Publish to app"
      confirmLabel="Publish"
      busy={busy}
      onCancel={onCancel}
      onConfirm={() => onConfirm(note.trim())}
      message={(
        <div className="hl2-fields">
          <p>Every phone gets {layoutCount === 1 ? 'this layout' : `these ${layoutCount} layouts`}{changes ? ` (${changes} ${changes === 1 ? 'change' : 'changes'} since the live one)` : ''} on its next refresh, within about a minute. The live set stays in Version history, so you can roll back.{unsaved ? ' Your unsaved edits are saved to the draft first.' : ''}</p>
          <Field label="Note (optional)" value={note} placeholder="What changed, e.g. Diwali layout from 29 Oct" maxLength={200} onChange={setNote} />
        </div>
      )}
    />
  );
}
