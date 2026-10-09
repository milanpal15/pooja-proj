/**
 * @typedef {Object} ProgressBarProps
 * @property {number} value
 * @property {number} [max=100]
 * @property {string} label   what is being measured ("Paid out")
 */
export function ProgressBar({ value, max = 100, label }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="ui-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(Math.min(value, max))}>
      <div className="ui-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
