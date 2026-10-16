import { Button, Modal } from '../../../ui/index.js';
import { PasswordField } from './PasswordField.jsx';

export function ResetPasswordModal({ form, saving, error, onChange, onSave, onClose }) {
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={`Set password for ${form.username}`}
      dismissible={!saving}
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={onSave}>
            Set password
          </Button>
        </>
      }>
      {!!error && <p className="feat-form-error" role="alert">{error}</p>}
      <PasswordField label="New password" value={form.password} onChange={(v) => onChange({ ...form, password: v })} />
    </Modal>
  );
}
