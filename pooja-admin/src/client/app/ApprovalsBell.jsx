import { useEffect } from 'react';

import { api } from '../lib/api/index.js';
import { onApprovalsChanged } from '../lib/approvals-signal.js';
import { useLoader } from '../lib/hooks/useLoader.js';

/**
 * The header bell: how many changes wait for a second operator. Polled every 60 s, and only for an operator who
 * can view approvals (nobody else gets a request sent at all). A failed poll keeps the last count.
 */
export function ApprovalsBell({ enabled, href }) {
  const pending = useLoader(() => api.approvals.list('pending'), { pollMs: 60000, enabled });
  useEffect(() => (enabled ? onApprovalsChanged(pending.reload) : undefined), [enabled, pending.reload]);
  if (!enabled) return null;
  const n = Array.isArray(pending.data) ? pending.data.length : 0;
  return (
    <a className={`bell ${n ? 'bell--on' : ''}`} href={href} aria-label={n ? `${n} approval${n === 1 ? '' : 's'} waiting` : 'Approvals, none waiting'} title="Approvals">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </svg>
      {n > 0 && <span className="bell__count">{n > 99 ? '99+' : n}</span>}
      <span className="bell__label">{n ? `${n} approval${n === 1 ? '' : 's'}` : ''}</span>
    </a>
  );
}
