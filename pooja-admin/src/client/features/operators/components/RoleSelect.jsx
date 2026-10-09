import { Field } from '../../../ui/index.js';
import { ROLES } from '../lib/roles.js';

/** The role dropdown in the table (the "New operator" modal has its own labelled one). */
export function RoleSelect({ value, onChange, disabled, label = 'Role' }) {
  return (
    <Field
      hideLabel
      type="select"
      label={label}
      className="ui-field--auto"
      value={value}
      disabled={disabled}
      options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
      onChange={onChange}
    />
  );
}

/** One line per role: what it can do. */
export function RoleGuide() {
  return (
    <ul className="role-guide">
      {ROLES.map((r) => (
        <li key={r.value}>
          <strong>{r.label}</strong> — {r.desc}
        </li>
      ))}
    </ul>
  );
}
