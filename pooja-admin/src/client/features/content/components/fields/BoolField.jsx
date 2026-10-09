import { Switch } from '../../../../ui/index.js';

/** The same switch as the Feature Flags tab, so a boolean looks alike everywhere. */
export function BoolField({ field, value, onChange }) {
  return <Switch variant="card" label={field.label} checked={!!value} onChange={onChange} />;
}
