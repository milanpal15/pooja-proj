import { Field } from '../../../../ui/index.js';
import { toEnumValue } from '../../lib/fields.js';

/**
 * A set of values stored as an array, chosen as one option.
 * Announcements only ever want modal, push, or both — three named choices
 * read better than two checkboxes the operator has to reason about.
 */
export function EnumListField({ field, value, onChange }) {
  return (
    <Field
      type="select"
      label={field.label}
      value={toEnumValue(value, field.options)}
      options={field.options}
      onChange={(v) => onChange(v.split(',').filter(Boolean))}
    />
  );
}
