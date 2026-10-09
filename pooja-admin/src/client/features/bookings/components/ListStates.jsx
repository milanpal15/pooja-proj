import { EmptyState, ErrorState, TableSkeleton } from '../../../ui/index.js';

/** Loading / error / empty for a loader-backed table; renders `children` only when there are rows. */
export function ListStates({ list, emptyTitle, emptyBody, children }) {
  const loaded = list.status === 'ready' || list.status === 'stale';
  if (list.status === 'loading') return <TableSkeleton />;
  if (list.status === 'error') return <ErrorState message={list.error} offline={list.offline} onRetry={list.reload} />;
  if (loaded && list.rows.length === 0) return <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>;
  return children;
}
