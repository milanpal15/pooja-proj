import { Button, EmptyState } from '../ui/index.js';

/** An address that is not a module, or a module this account cannot open. Says which, and leads back. */
export function NotFound({ raw, denied, title, firstHref, onHome }) {
  return (
    <div className="ui-page">
      <EmptyState
        title={denied ? `You don't have access to ${title}` : "We couldn't find that page"}
        action={
          <Button variant="outline" onClick={onHome}>
            {firstHref ? 'Go to the dashboard' : 'Back'}
          </Button>
        }>
        {denied
          ? 'Your role does not include this area. Ask an administrator if you need it.'
          : `Nothing lives at ${raw ? `"${raw}"` : 'this address'}. It may have moved, or the link is mistyped. Press Ctrl/⌘ K to search for a page.`}
      </EmptyState>
    </div>
  );
}
