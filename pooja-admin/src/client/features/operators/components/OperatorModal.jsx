import { Button, Field, Modal } from '../../../ui/index.js';
import { ROLES } from '../lib/roles.js';
import { PasswordField } from './PasswordField.jsx';

/** "New operator". */
export function OperatorModal({ roles = ROLES, form, saving, error, onChange, onCreate, onClose }) {
  const set = (k) => (v) => onChange({ ...form, [k]: v });
  return (
    <Modal
      open
      onClose={onClose}
      title="New operator"
      dismissible={!saving}
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={onCreate}>
            Create
          </Button>
        </>
      }>
      {!!error && <p className="feat-form-error" role="alert">{error}</p>}
      <Field label="Username" value={form.username} placeholder="3–32 characters, a–z 0–9 . _ -" onChange={set('username')} />
      <PasswordField value={form.password} onChange={set('password')} />
      <Field
        label="Role"
        type="select"
        value={form.role}
        options={roles.map((r) => ({ value: r.value, label: r.label }))}
        hint={roles.find((r) => r.value === form.role)?.desc}
        onChange={set('role')}
      />
    </Modal>
  );
}
