import { Button } from '../../../ui/index.js';

/**
 * A row's trailing controls: its custom action (if any), Edit, Delete — or,
 * for an account that cannot edit, a single View that opens the read-only modal.
 */
export function RowActions({ row, name, rowAction, busy, readOnly, onRowAction, onEdit, onDelete }) {
  if (readOnly) {
    return (
      <td className="actions">
        <div className="ui-actions">
          <Button variant="outline" size="sm" aria-label={`View ${name}`} onClick={() => onEdit(row)}>
            View
          </Button>
        </div>
      </td>
    );
  }
  return (
    <td className="actions">
      <div className="ui-actions">
        {rowAction && (
          <Button variant="outline" size="sm" title={rowAction.title} aria-label={`${rowAction.label} ${name}`} disabled={busy} onClick={() => onRowAction(row)}>
            {rowAction.label}
          </Button>
        )}
        <Button variant="outline" size="sm" aria-label={`Edit ${name}`} onClick={() => onEdit(row)}>
          Edit
        </Button>
        <Button variant="danger" size="sm" aria-label={`Delete ${name}`} onClick={() => onDelete(row)}>
          Delete
        </Button>
      </div>
    </td>
  );
}
