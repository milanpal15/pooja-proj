import { Button } from './Button.jsx';

/** A region with no data: what is missing, and the action that fixes it. */
export function EmptyState({ title, children, action }) {
  return (
    <div className="ui-state">
      <p className="ui-state__title">{title}</p>
      {children && <p className="ui-state__body">{children}</p>}
      {action}
    </div>
  );
}

/** A region that failed to load. `offline` says the API is unreachable, not just unhappy. */
export function ErrorState({ message, offline = false, onRetry }) {
  return (
    <div className="ui-state" role="alert">
      <p className="ui-state__title">{offline ? "Can't reach the API" : "Couldn't load this"}</p>
      <p className="ui-state__body">
        {offline
          ? 'The dashboard cannot reach the server. Check that the API is running and try again.'
          : message}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Persistent state of the page ("showing the last data we got") — not a toast. */
export function Banner({ tone = 'warning', children, action }) {
  return (
    <div className={`ui-banner ui-banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span style={{ flex: 1 }}>{children}</span>
      {action}
    </div>
  );
}

/** A placeholder that holds layout while data loads. */
export function Skeleton({ width = '100%', height = '1em' }) {
  return <span className="ui-skeleton" style={{ width, height }} aria-hidden="true" />;
}

/** Rows of skeleton for a table body that is still loading. */
export function TableSkeleton({ rows = 4 }) {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height="1.1em" />
      ))}
    </div>
  );
}
