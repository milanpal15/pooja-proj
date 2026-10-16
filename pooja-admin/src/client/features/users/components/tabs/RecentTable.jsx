import { DataTable } from '../../../../ui/index.js';
import { formatWhen } from '../../../../lib/dates.js';

/** A short "recent" list: When · What · Status · Amount, from the row readers in lib/format.js. */
export function RecentTable({ label, rows, headers = ['When', 'What', 'Status', 'Coins'], showDetail = true }) {
  return (
    <DataTable label={label} minWidth={520}>
      <thead>
        <tr>
          <th scope="col">{headers[0]}</th>
          <th scope="col">{headers[1]}</th>
          <th scope="col">{headers[2]}</th>
          <th scope="col" className="num">{headers[3]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="muted">{formatWhen(r.when)}</td>
            <td>
              {r.title}
              {showDetail && r.detail != null && <div className="sub">{String(r.detail)}</div>}
            </td>
            <td>{r.status ?? r.kind ?? '—'}</td>
            <td className="num">{r.amount == null ? '—' : Number(r.amount).toLocaleString('en-IN')}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
