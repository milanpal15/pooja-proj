import { useState } from 'react';

import { Button, Field, Modal } from '../../../ui/index.js';

/** Approve (note optional) or reject (a reason is required) one request. */
export function DecisionModal({ request, kind, onClose, onSubmit }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const reject = kind === 'reject';
  const missing = reject && !note.trim();
  return (
    <Modal open onClose={onClose} size="sm" title={reject ? 'Reject request' : 'Approve and apply'} subtitle={request.summary} dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button variant={reject ? 'danger-solid' : 'primary'} loading={busy} disabled={missing} onClick={async () => { setBusy(true); await onSubmit(note.trim()); setBusy(false); }}>
            {reject ? 'Reject request' : 'Approve and apply'}
          </Button>
        </>
      }>
      {!reject && <p style={{ marginTop: 0, fontSize: 14 }}>The change is checked again and applied straight away. Phones pick it up within about a minute.</p>}
      <Field label={reject ? 'Why are you rejecting it?' : 'Note (optional)'} type="textarea" value={note} onChange={setNote} hint={reject ? 'The requester sees this.' : undefined} error={missing && note ? 'A reason is required.' : undefined} />
    </Modal>
  );
}
