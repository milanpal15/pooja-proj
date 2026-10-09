import { Field } from '../../../../ui/index.js';

export function SelectField({ field, value, onChange }) {
  return (
    <Field
      type="select"
      label={field.label}
      value={String(value || field.options?.[0]?.value || '')}
      options={field.options}
      onChange={onChange}
    />
  );
}
