import { Button, Field, Modal } from '../../../ui/index.js';
import { ROLES } from '../lib/roles.js';

/** "New operator". */
export function OperatorModal({ form, saving, error, onChange, onCreate, onClose }) {
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
      <Field label="Password" type="password" value={form.password} placeholder="at least 8 characters" onChange={set('password')} />
      <Field
        label="Role"
        type="select"
        value={form.role}
        options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
        hint={ROLES.find((r) => r.value === form.role)?.desc}
        onChange={set('role')}
      />
    </Modal>
  );
}
