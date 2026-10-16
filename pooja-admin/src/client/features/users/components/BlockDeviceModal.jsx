import { useState } from 'react';

import { Banner, Button, Field, Modal, Segmented } from '../../../ui/index.js';
import { blankDeviceForm, toDeviceBody, validateDeviceBlock } from '../lib/devices.js';
import { serverFields } from '../lib/block.js';

/** Block a device (one the operator picked, or one typed in on the Blocked devices page). */
export function BlockDeviceModal({ deviceId = '', onClose, onSubmit }) {
  const fixed = !!deviceId;
  const [form, setForm] = useState(() => blankDeviceForm(deviceId));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState({});
  const [failure, setFailure] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const errors = { ...(tried ? validateDeviceBlock(form) : {}), ...server };
  const submit = async (e) => {
    e?.preventDefault();
    setTried(true);
    if (Object.keys(validateDeviceBlock(form)).length) return;
    setBusy(true);
    setFailure('');
    try {
      await onSubmit(toDeviceBody(form));
    } catch (err) {
      const f = serverFields(err);
      setServer(f);
      setFailure(Object.keys(f).length ? '' : err.message);
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Block a device"
      subtitle="Whoever uses this phone sees the message, whichever account they sign in with."
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger-solid" type="submit" form="usr-device-form" loading={busy}>
            Block device
          </Button>
        </>
      }>
      <form id="usr-device-form" onSubmit={submit} className="usr-stack" noValidate>
        {failure && <Banner tone="error">{failure}</Banner>}
        <Field label="Device id" value={form.deviceId} onChange={set('deviceId')} error={errors.deviceId} readOnly={fixed} autoComplete="off" spellCheck={false} hint={fixed ? undefined : 'The id the app sends in X-Device-Id (see a user’s Devices tab).'} />
        <Field label="Reason (operators only)" type="textarea" rows={2} value={form.reason} onChange={set('reason')} error={errors.reason} />
        <Field label="Message shown in the app (English)" type="textarea" rows={2} value={form.message} onChange={set('message')} error={errors.message} />
        <Field label="Message in Hindi (optional)" type="textarea" rows={2} lang="hi" value={form.messageHi} onChange={set('messageHi')} error={errors.messageHi} />
        <div className="usr-block__until">
          <span className="ui-field__label">Block ends</span>
          <Segmented label="Block ends" value={form.mode} onChange={set('mode')} options={[{ value: 'forever', label: 'Until I unblock' }, { value: 'until', label: 'On a date' }]} />
          {form.mode === 'until' && <Field hideLabel label="End date and time" type="datetime-local" value={form.until} onChange={set('until')} error={errors.until} />}
        </div>
      </form>
    </Modal>
  );
}
