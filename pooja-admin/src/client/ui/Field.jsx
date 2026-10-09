import { useId, useRef } from 'react';

import { Button } from './Button.jsx';

/**
 * Label + control + hint/error, wired together (label for, aria-describedby,
 * aria-invalid). Controlled: `value` + `onChange(value)` — the *value*, not the event.
 *
 * @typedef {Object} FieldProps
 * @property {string} label
 * @property {'text'|'number'|'date'|'textarea'|'select'|'email'|'search'} [type='text']
 * @property {string|number} value
 * @property {(value: string) => void} [onChange]
 * @property {string} [hint]       helper text; replaced by `error` when there is one
 * @property {string} [error]
 * @property {Array<{value: string, label: string}>} [options]   for type="select"
 * @property {boolean} [hideLabel] keep the label for screen readers only (toolbars)
 * @property {boolean} [readOnly]
 * @property {React.ReactNode} [children]  <option>s override, or a custom control for `as="custom"`
 */
export function Field({
  label,
  type = 'text',
  value,
  onChange,
  hint,
  error,
  options,
  hideLabel = false,
  className = '',
  children,
  ...rest
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const common = {
    id,
    className: 'ui-input',
    value: value ?? '',
    onChange: onChange ? (e) => onChange(e.target.value) : undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hint ? noteId : undefined,
    ...rest,
  };

  let control;
  if (type === 'textarea') control = <textarea rows={3} {...common} />;
  else if (type === 'select') {
    control = (
      <select {...common}>
        {children ||
          (options || []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
    );
  } else control = <input type={type} {...common} />;

  return (
    <div className={`ui-field ${className}`.trim()}>
      <label htmlFor={id} className={hideLabel ? 'ui-sr-only' : 'ui-field__label'}>
        {label}
      </label>
      {control}
      {error ? (
        <p id={noteId} className="ui-field__error">
          {error}
        </p>
      ) : (
        hint && (
          <p id={noteId} className="ui-field__hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** A non-editable value laid out like a Field ("Astrologer earns — 14 coins/min"). */
export function ReadoutField({ label, children, hint }) {
  const id = useId();
  return (
    <div className="ui-field">
      <span id={id} className="ui-field__label">
        {label}
      </span>
      <output aria-labelledby={id} className="ui-readout">
        {children}
      </output>
      {hint && <p className="ui-field__hint">{hint}</p>}
    </div>
  );
}

/**
 * A URL box plus an Upload button (and an optional preview), for image/audio
 * fields. The native file input is visually hidden and driven by the button, so
 * the control is a real, keyboard-operable Button and not a styled <label>.
 *
 * @typedef {Object} FileFieldProps
 * @property {string} label
 * @property {string} value                  the stored URL
 * @property {(value: string) => void} onChange   typing/pasting a URL
 * @property {(file: File) => void} onFile   a file was chosen
 * @property {string} [accept]               e.g. "image/*"
 * @property {boolean} [uploading]           shows a spinner on the button and disables it
 * @property {string} [placeholder]
 * @property {React.ReactNode} [preview]     rendered right of the button (a thumbnail)
 * @property {string} [hint]
 */
export function FileField({ label, value, onChange, onFile, accept, uploading = false, placeholder, preview, hint }) {
  const id = useId();
  const fileRef = useRef(null);
  return (
    <div className="ui-field">
      <label htmlFor={id} className="ui-field__label">
        {label}
      </label>
      <div className="ui-filefield">
        <input id={id} className="ui-input" value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        <Button variant="outline" loading={uploading} aria-label={`Upload ${label}`} onClick={() => fileRef.current?.click()}>
          Upload
        </Button>
        <input
          ref={fileRef}
          type="file"
          tabIndex={-1}
          aria-hidden="true"
          className="ui-filefield__input"
          accept={accept}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onFile(f);
          }}
        />
        {preview}
      </div>
      {hint && <p className="ui-field__hint">{hint}</p>}
    </div>
  );
}
