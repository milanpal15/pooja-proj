import { Field } from '../../../../ui/index.js';

export function TextareaField({ field, value, onChange }) {
  return <Field type="textarea" rows={4} label={field.label} value={value} onChange={onChange} />;
}
