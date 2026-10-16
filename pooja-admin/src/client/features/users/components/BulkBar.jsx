import { Button } from '../../../ui/index.js';

/** Shown while rows are ticked: add a tag to all of them, export just them, or let go. */
export function BulkBar({ count, busy, onAddTag, onExport, onClear }) {
  return (
    <div className="usr-bulk" role="region" aria-label="Selected users">
      <b>{count} selected</b>
      <div className="usr-bulk__actions">
        <Button variant="outline" size="sm" onClick={onAddTag} disabled={busy}>
          Add tag…
        </Button>
        <Button variant="outline" size="sm" onClick={onExport} disabled={busy}>
          Export selected
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
          Clear selection
        </Button>
      </div>
    </div>
  );
}
