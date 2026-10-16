import { useId, useState } from 'react';

import { Button } from './Button.jsx';

/**
 * A list of short values as removable chips plus an add box (blocked builds, allow-listed users).
 * `parse(text) -> value | undefined` turns what was typed into a value (undefined = not acceptable, `onReject` is told).
 * Pasting "11, 12 13" adds each. Read-only shows the chips as plain text.
 *
 * @typedef {Object} ChipInputProps
 * @property {string} label
 * @property {Array<string|number>} value
 * @property {(next: Array<string|number>) => void} onChange
 * @property {(text: string) => string|number|undefined} [parse]
 * @property {string} [hint]
 * @property {string} [error]
 * @property {string} [placeholder]
 * @property {string} [addLabel]
 * @property {boolean} [readOnly]
 * @property {(v: string|number) => string} [format]
 */
export function ChipInput({ label, value, onChange, parse = (t) => t, hint, error, placeholder, addLabel = 'Add', readOnly = false, format = String }) {
  const id = useId();
  const [text, setText] = useState('');
  const [bad, setBad] = useState('');

  const commit = () => {
    const parts = text.split(/[\s,]+/).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) {
      const v = parse(p);
      if (v === undefined) {
        setBad(`"${p}" is not a valid entry.`);
        return;
      }
      if (!next.includes(v)) next.push(v);
    }
    setBad('');
    setText('');
    onChange(next);
  };

  return (
    <div className="ui-field">
      <label htmlFor={id} className="ui-field__label">
        {label}
      </label>
      <div className="ui-chips" role="list" aria-label={label}>
        {value.length === 0 && <span className="ui-chips__none">None</span>}
        {value.map((v) => (
          <span key={String(v)} className="ui-chip" role="listitem">
            {format(v)}
            {!readOnly && (
              <button type="button" className="ui-chip__x" aria-label={`Remove ${format(v)}`} onClick={() => onChange(value.filter((x) => x !== v))}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div className="ui-chips__add">
          <input
            id={id}
            className="ui-input"
            value={text}
            placeholder={placeholder}
            aria-invalid={bad || error ? true : undefined}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
          />
          <Button variant="outline" onClick={commit} disabled={!text.trim()}>
            {addLabel}
          </Button>
        </div>
      )}
      {bad || error ? <p className="ui-field__error">{bad || error}</p> : hint && <p className="ui-field__hint">{hint}</p>}
    </div>
  );
}
