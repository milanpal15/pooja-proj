import { Field } from '../../../../ui/index.js';

/** Plain text input. Also the fallback for csv (an array shows comma-joined) and any unknown type. */
export function TextField({ field, value, onChange }) {
  return (
    <Field
      type={field.type === 'number' ? 'number' : 'text'}
      label={field.label}
      value={Array.isArray(value) ? value.join(', ') : value ?? ''}
      onChange={onChange}
    />
  );
}
