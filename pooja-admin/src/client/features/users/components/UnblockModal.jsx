import { useState } from 'react';

import { Button, Field, Modal, Switch } from '../../../ui/index.js';
import { displayName } from '../lib/format.js';

/** Unblock with an optional note for the history; offers to lift the device blocks too when there are any. */
export function UnblockModal({ user, blockedDevices = 0, onClose, onSubmit }) {
  const [note, setNote] = useState('');
  const [devices, setDevices] = useState(blockedDevices > 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await onSubmit({ note: note.trim() || undefined, unblockDevices: blockedDevices > 0 ? devices : undefined });
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Unblock ${displayName(user)}`}
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="usr-unblock-form" loading={busy}>
            Unblock
          </Button>
        </>
      }>
      <form id="usr-unblock-form" onSubmit={go} className="usr-stack">
        <p style={{ margin: 0, fontSize: 14 }}>They can sign in again straight away.</p>
        <Field label="Note for the history (optional)" type="textarea" rows={2} value={note} onChange={setNote} />
        {blockedDevices > 0 && <Switch variant="card" checked={devices} onChange={setDevices} label="Also unblock their devices" hint={`${blockedDevices} blocked ${blockedDevices === 1 ? 'device' : 'devices'}.`} />}
        {err && <p className="ui-field__error">{err}</p>}
      </form>
    </Modal>
  );
}
