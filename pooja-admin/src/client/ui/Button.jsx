/**
 * @typedef {Object} ButtonProps
 * @property {'primary'|'secondary'|'outline'|'ghost'|'danger'|'danger-solid'} [variant='primary']
 *   `danger` is the quiet red text button (far-left in a modal footer);
 *   `danger-solid` is the confirming button of a destructive ConfirmDialog.
 * @property {'sm'|'md'} [size='md']   both keep the 44px target; sm only tightens padding
 * @property {boolean} [loading]       shows a spinner, sets aria-busy, ignores clicks
 * @property {boolean} [disabled]
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={`ui-btn ui-btn--${variant} ui-btn--${size} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}>
      {loading && <span className="ui-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

/**
 * Icon-only control. `label` is required: it is the accessible name.
 * @typedef {Object} IconButtonProps
 * @property {string} label
 */
export function IconButton({ label, className = '', children, type = 'button', ...rest }) {
  return (
    <button type={type} aria-label={label} title={label} className={`ui-iconbtn ${className}`.trim()} {...rest}>
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
