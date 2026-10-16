import { useMemo, useState } from 'react';

import { Banner, Button, Field, Modal, Segmented, Switch, useConfirm } from '../../../ui/index.js';
import { LIMIT, blankBlockForm, counter, isDirty, serverFields, toBlockBody, validateBlock } from '../lib/block.js';
import { displayName } from '../lib/format.js';
import { AccountBlockedPhone } from './AccountBlockedPhone.jsx';

const Count = ({ text }) => {
  const c = counter(text);
  return <span className={`usr-count ${c.over ? 'usr-count--over' : ''}`}>{c.label}</span>;
};

/**
 * Block… (docs/USERS.md §5). Internal reason (operators only), the message the person reads (English required, Hindi
 * optional), an end time or "until I unblock", "also block this user's devices", and a phone preview. Calling it on an
 * already-blocked user updates the message and end time.
 */
export function BlockModal({ user, deviceCount = 0, onClose, onSubmit }) {
  const base = useMemo(() => blankBlockForm(user), [user]);
  const [form, setForm] = useState(base);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState({});
  const [failure, setFailure] = useState('');
  const confirm = useConfirm();
  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setServer((s) => ({ ...s, [k]: undefined }));
  };
  const errors = { ...(tried ? validateBlock(form) : {}), ...Object.fromEntries(Object.entries(server).filter(([, v]) => v)) };
  const updating = !!user?.block?.active;

  const close = async () => {
    if (busy) return;
    if (isDirty(form, base) && !(await confirm({ title: 'Discard this block?', message: 'What you typed will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', tone: 'danger' }))) return;
    onClose();
  };

  const submit = async (e) => {
    e?.preventDefault();
    setTried(true);
    if (Object.keys(validateBlock(form)).length) return;
    setBusy(true);
    setFailure('');
    try {
      await onSubmit(toBlockBody(form));
    } catch (err) {
      const fields = serverFields(err);
      setServer(fields);
      setFailure(Object.keys(fields).length ? '' : err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      size="lg"
      title={updating ? `Update the block on ${displayName(user)}` : `Block ${displayName(user)}`}
      subtitle="They are signed out and see the message below instead of the app."
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger-solid" type="submit" form="usr-block-form" loading={busy}>
            {updating ? 'Update block' : 'Block user'}
          </Button>
        </>
      }>
      <div className="usr-block">
        <form id="usr-block-form" className="usr-block__form" onSubmit={submit} noValidate>
          {failure && <Banner tone="error">{failure}</Banner>}
          <div>
            <Field label="Reason (operators only)" type="textarea" rows={3} value={form.reason} onChange={set('reason')} error={errors.reason} placeholder="e.g. Abusive messages to an astrologer, reported 14 Oct" hint="Never shown to the person. Kept in the history." />
            <Count text={form.reason} />
          </div>
          <div>
            <Field label="Message shown in the app (English)" type="textarea" rows={3} value={form.message} onChange={set('message')} error={errors.message} placeholder="Your account has been blocked because…" hint="The person reads exactly this." />
            <Count text={form.message} />
          </div>
          <div>
            <Field label="Message in Hindi (optional)" type="textarea" rows={3} lang="hi" value={form.messageHi} onChange={set('messageHi')} error={errors.messageHi} placeholder="आपका खाता ब्लॉक कर दिया गया है…" hint="Hindi readers see English if this is empty." />
            <Count text={form.messageHi} />
          </div>
          <div className="usr-block__until">
            <span className="ui-field__label" id="usr-block-ends">Block ends</span>
            <Segmented label="Block ends" value={form.mode} onChange={set('mode')} options={[{ value: 'forever', label: 'Until I unblock' }, { value: 'until', label: 'On a date' }]} />
            {form.mode === 'until' && <Field hideLabel label="End date and time" type="datetime-local" value={form.until} onChange={set('until')} error={errors.until} />}
          </div>
          <Switch
            variant="card"
            checked={form.alsoDevices}
            onChange={set('alsoDevices')}
            label="Also block this user’s devices"
            hint={deviceCount ? `${deviceCount} registered ${deviceCount === 1 ? 'device' : 'devices'}. Stops a new account on the same phone.` : 'Stops a new account on the same phone.'}
          />
          <p className="muted usr-limit">Each message is at most {LIMIT} characters.</p>
        </form>
        <AccountBlockedPhone form={form} />
      </div>
    </Modal>
  );
}
