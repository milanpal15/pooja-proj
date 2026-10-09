import { DataTable } from '../../../ui/index.js';
import { ContentRow } from './ContentRow.jsx';

/** The records table: thumbnail, a column per chosen field, actions. */
export function ContentTable({ rows, columns, title, rowAction, busyRow, readOnly, onToggle, onRowAction, onEdit, onDelete }) {
  return (
    <DataTable label={title} minWidth={720}>
      <thead>
        <tr>
          <th aria-label="Image"></th>
          {columns.map((f) => (
            <th key={f.key}>{f.label}</th>
          ))}
          <th aria-label="Actions"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <ContentRow
            key={row._id}
            row={row}
            columns={columns}
            rowAction={rowAction}
            busy={busyRow === row._id}
            readOnly={readOnly}
            onToggle={onToggle}
            onRowAction={onRowAction}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </DataTable>
  );
}
