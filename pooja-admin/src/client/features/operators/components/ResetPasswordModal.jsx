import { Button, Field, Modal } from '../../../ui/index.js';

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
      <Field
        label="New password"
        type="password"
        value={form.password}
        placeholder="at least 8 characters"
        onChange={(v) => onChange({ ...form, password: v })}
      />
    </Modal>
  );
}
