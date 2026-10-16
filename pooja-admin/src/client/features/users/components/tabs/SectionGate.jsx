import { useState } from 'react';

import { Button, EmptyState, Skeleton } from '../../../../ui/index.js';
import { tabState } from '../../lib/detail.js';

/**
 * The shared shell of a tab: skeleton while the 360 loads, an "unavailable" panel with Retry when the service behind
 * the tab did not answer in time (never an empty state — that would claim there is nothing), an empty state, or the
 * content. Retry re-asks for the whole 360 (the endpoint has no per-section form) and shows a spinner meanwhile.
 */
export function SectionGate({ detail, tab, label, emptyTitle, emptyText, onRetry, children }) {
  const [retrying, setRetrying] = useState(false);
  const state = tabState(detail, tab);
  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
  if (state === 'loading') return <TabSkeleton />;
  if (state === 'unavailable') {
    const reason = detail?.[tab]?.reason;
    return (
      <div className="ui-state usr-unavail" role="status">
        <p className="ui-state__title">{label} is unavailable right now</p>
        <p className="ui-state__body">
          That service did not answer in time. Nothing here is lost, and the rest of this person’s record is accurate.
          {reason ? <span className="usr-unavail__reason"> ({reason})</span> : null}
        </p>
        <Button variant="outline" size="sm" loading={retrying} onClick={retry}>
          Retry
        </Button>
      </div>
    );
  }
  if (state === 'empty') return <EmptyState title={emptyTitle}>{emptyText}</EmptyState>;
  return children;
}

export function TabSkeleton() {
  return (
    <div className="usr-skel" role="status" aria-label="Loading">
      <Skeleton height="1.4em" width="40%" />
      <Skeleton height="1.1em" />
      <Skeleton height="1.1em" />
      <Skeleton height="1.1em" width="80%" />
    </div>
  );
}
