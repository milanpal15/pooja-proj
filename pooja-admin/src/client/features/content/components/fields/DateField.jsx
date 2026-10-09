import { Field } from '../../../../ui/index.js';

/**
 * A real picker, not free text: a mistyped date publishes to a day nobody is
 * looking at, silently.
 */
export function DateField({ field, value, onChange }) {
  return <Field type="date" label={field.label} value={value} onChange={onChange} />;
}
