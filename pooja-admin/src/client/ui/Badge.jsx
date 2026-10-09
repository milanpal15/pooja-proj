/**
 * A status chip. Colour never speaks alone: children are always the word.
 * @typedef {Object} BadgeProps
 * @property {'neutral'|'success'|'warning'|'danger'|'accent'|'info'|'live'|'outline'} [tone='neutral']
 */
export function Badge({ tone = 'neutral', className = '', children }) {
  return <span className={`ui-badge ui-badge--${tone} ${className}`.trim()}>{children}</span>;
}
