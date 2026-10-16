import { useState } from 'react';

import { Banner, Button, Field, Modal } from '../../../ui/index.js';
import { deleteMatches, deletePhrase } from '../lib/detail.js';
import { displayName } from '../lib/format.js';

/** Delete… with a typed confirmation: the contact, or the last six characters of the uid when the contact is masked. */
export function DeleteUserModal({ user, onClose, onSubmit }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const phrase = deletePhrase(user);
  const ok = deleteMatches(text, user);
  const go = async (e) => {
    e?.preventDefault();
    if (!ok) return;
    setBusy(true);
    setErr('');
    try {
      await onSubmit(text.trim());
    } catch (x) {
      setErr(x.code === 'confirm_mismatch' ? 'That does not match. Nothing was deleted.' : x.message);
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Delete ${displayName(user)}`}
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger-solid" type="submit" form="usr-delete-form" loading={busy} disabled={!ok}>
            Delete user
          </Button>
        </>
      }>
      <form id="usr-delete-form" onSubmit={go} className="usr-stack">
        <Banner tone="error">This deletes the account and its sign-in. It cannot be undone, and it is recorded in the audit log.</Banner>
        <Field label={phrase ? `Type ${phrase} to confirm` : 'Type the confirmation'} value={text} onChange={setText} autoComplete="off" spellCheck={false} error={err} hint="The phone number or e-mail as shown above, or the last 6 characters of the user id." />
      </form>
    </Modal>
  );
}
