import { Segmented } from '../../../../ui/index.js';

/** A two-or-three way choice shown as joined buttons (e.g. the slide type) instead of a drop-down. */
export function SegmentedField({ field, value, onChange }) {
  return (
    <div className="ui-field">
      <span className="ui-field__label">{field.label}</span>
      <Segmented label={field.label} options={field.options} value={String(value || field.options?.[0]?.value || '')} onChange={onChange} />
    </div>
  );
}
