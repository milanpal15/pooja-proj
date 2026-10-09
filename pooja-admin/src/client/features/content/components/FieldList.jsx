import { api } from '../../../lib/api/index.js';
import { ReadOnlyList } from '../../../ui/index.js';
import { displayValue } from '../lib/display.js';
import { fieldComponent } from './fields/index.js';

/**
 * The form's body: a labelled control per field, looked up by type (each
 * control renders its own label) — or, when `readOnly`, the same fields as text.
 */
export function FieldList({ fields, values, onChange, uploading, onFile, readOnly = false }) {
  // `virtual` fields (a preview, a note) draw something but store nothing;
  // `showIf(values)` hides a field that does not apply to this row yet.
  const shown = fields.filter((f) => !f.showIf || f.showIf(values));
  if (readOnly) {
    return (
      <ReadOnlyList
        label="Details"
        rows={shown.filter((f) => !f.virtual).map((f) => {
          const value = values[f.key];
          const text = displayValue(f, value);
          return {
            label: f.label,
            value:
              f.type === 'image' && value ? (
                <>
                  <img className="ui-thumb" src={api.asset(value)} alt="" /> {text}
                </>
              ) : (
                text
              ),
          };
        })}
      />
    );
  }
  const control = (f) => {
    const Control = fieldComponent(f.type);
    return (
      <Control
        key={f.key}
        field={f}
        value={values[f.key]}
        values={values}
        onChange={(v) => onChange(f.key, v)}
        uploading={uploading === f.key}
        onFile={(file) => onFile(f.key, file)}
      />
    );
  };
  // Runs of `half` fields sit side by side, two to a row (a title and its Hindi twin, a from and an until date).
  const out = [];
  for (let i = 0; i < shown.length; i += 1) {
    if (!shown[i].half) {
      out.push(control(shown[i]));
      continue;
    }
    const run = [];
    while (i < shown.length && shown[i].half) run.push(control(shown[i++]));
    i -= 1;
    out.push(
      <div key={`row-${run[0].key}`} className="feat-grid2 feat-grid--top">
        {run}
      </div>,
    );
  }
  return <>{out}</>;
}
