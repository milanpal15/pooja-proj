import { Skeleton } from './States.jsx';

/**
 * One headline number.
 * @typedef {Object} StatCardProps
 * @property {string} label
 * @property {React.ReactNode} value     null/undefined renders "—"
 * @property {string} [suffix]           "of 12"
 * @property {'default'|'primary'|'success'|'warning'} [tone]
 * @property {boolean} [loading]
 */
export function StatCard({ label, value, suffix, tone = 'default', loading = false }) {
  return (
    <div className="ui-stat">
      <div className="ui-stat__label">{label}</div>
      <div className={`ui-stat__value ${tone !== 'default' ? `ui-stat__value--${tone}` : ''}`}>
        {loading ? (
          <Skeleton width="60%" />
        ) : (
          <>
            {value ?? '—'}
            {suffix && <span className="ui-stat__suffix"> {suffix}</span>}
          </>
        )}
      </div>
    </div>
  );
}

export function StatGrid({ children, ...rest }) {
  return (
    <section className="ui-stat-grid" {...rest}>
      {children}
    </section>
  );
}
