import { idOf } from '../../../lib/ids.js';
import { DataTable } from '../../../ui/index.js';
import { PoojaRow } from './PoojaRow.jsx';

export function PoojaTable({ rows, busy, opening, ...rest }) {
  return (
    <DataTable label="Poojas" minWidth={980} className="pj-table">
      <thead>
        <tr>
          <th>Pooja</th>
          <th>Temple</th>
          <th>Pooja date</th>
          <th>Packages (coins)</th>
          <th className="num">Bookings</th>
          <th>Status</th>
          <th>Visible</th>
          <th>
            <span className="ui-sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <PoojaRow key={idOf(p) ?? p.slug} pooja={p} busy={busy === idOf(p)} opening={opening === idOf(p)} {...rest} />
        ))}
      </tbody>
    </DataTable>
  );
}
