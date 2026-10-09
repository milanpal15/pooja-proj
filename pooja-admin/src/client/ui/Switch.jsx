import { useId } from 'react';

/**
 * A real checkbox with role="switch". State is always spelled out (On/Off) so
 * it never relies on the colour of the track.
 *
 * @typedef {Object} SwitchProps
 * @property {boolean} checked
 * @property {(next: boolean) => void} onChange
 * @property {string} label           accessible name (visible in the `card` layout)
 * @property {string} [hint]          second line, `card` layout only
 * @property {'inline'|'card'} [variant='inline']  inline = table cell; card = form row
 * @property {boolean} [disabled]
 */
export function Switch({ checked, onChange, label, hint, variant = 'inline', disabled = false, ...rest }) {
  const id = useId();
  const input = (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="ui-switch__input"
      checked={!!checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={variant === 'inline' ? label : undefined}
      {...rest}
    />
  );
  if (variant === 'card') {
    return (
      <label className="ui-switch ui-switch--card">
        {input}
        <span className="ui-switch__text">
          <b>{label}</b>
          {hint && <span>{hint}</span>}
        </span>
      </label>
    );
  }
  return (
    <label className="ui-switch">
      {input}
      <span className={`ui-switch__state ${checked ? 'ui-switch__state--on' : ''}`}>
        {checked ? 'On' : 'Off'}
      </span>
    </label>
  );
}
