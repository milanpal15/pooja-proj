import { Badge } from '../ui/index.js';
import { ApprovalsBell } from './ApprovalsBell.jsx';

const ENV = { local: ['LOCAL', 'outline'], tester: ['TESTER', 'warning'], production: ['PRODUCTION', 'danger'] };
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The strip above every page: drawer button (narrow screens), ⌘K search, environment badge, approvals bell. */
export function TopBar({ environment, canApprovals, approvalsHref, onMenu, onSearch }) {
  const env = ENV[String(environment || '').toLowerCase()];
  return (
    <header className="topbar">
      <button type="button" className="topbar__menu" aria-label="Open navigation" onClick={onMenu}>
        <span aria-hidden="true">☰</span>
      </button>
      <button type="button" className="topbar__search" onClick={onSearch} aria-label="Search or jump to a page">
        <span aria-hidden="true">⌕</span>
        <span className="topbar__search-text">Search or jump…</span>
        <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <span className="topbar__spacer" />
      {env && (
        <span className="topbar__env" role="status" aria-label={`Environment: ${env[0].toLowerCase()}`}>
          <Badge tone={env[1]}>{env[0]}</Badge>
        </span>
      )}
      <ApprovalsBell enabled={canApprovals} href={approvalsHref} />
    </header>
  );
}
