import { api } from '../../../lib/api/index.js';
import { StatusText, Switch } from '../../../ui/index.js';
import { displayValue } from '../lib/display.js';
import { RowActions } from './RowActions.jsx';

/** One record: thumbnail, a cell per chosen column (booleans switch in place), actions. */
export function ContentRow({ row, columns, rowAction, busy, readOnly, onToggle, onRowAction, onEdit, onDelete }) {
  const name = row.name || row.title || row.question || 'item';
  return (
    <tr>
      <td>
        {row.imageUrl || row.image ? (
          <img className="ui-thumb" src={api.asset(row.imageUrl || row.image)} alt="" />
        ) : (
          <div className="ui-thumb ui-thumb--ph">{String(name)[0]}</div>
        )}
      </td>
      {columns.map((f) => (
        <td key={f.key} className={f.type === 'bool' ? '' : 'muted'}>
          {f.type === 'bool' && readOnly ? (
            <StatusText on={!!row[f.key]} />
          ) : f.type === 'bool' ? (
            <Switch label={`${f.label}: ${name}`} checked={!!row[f.key]} disabled={busy} onChange={() => onToggle(row, f.key)} />
          ) : (
            f.type === 'select' || f.type === 'dayIso' ? displayValue(f, row[f.key]) : String(row[f.key] ?? '')
          )}
        </td>
      ))}
      <RowActions
        row={row}
        name={name}
        rowAction={rowAction}
        busy={busy}
        readOnly={readOnly}
        onRowAction={onRowAction}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </tr>
  );
}
