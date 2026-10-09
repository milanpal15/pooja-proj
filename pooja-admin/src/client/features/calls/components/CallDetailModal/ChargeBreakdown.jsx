import { DataTable } from '../../../../ui/index.js';
import { formatCoins } from '../../../../lib/money.js';
import { chargeSummary } from '../../lib/charges.js';

/** What was charged, minute by minute — only when it adds up to the total. */
export function ChargeBreakdown({ call }) {
  const s = chargeSummary(call);
  if (s.coins === 0) {
    return <p className="ui-field__hint">Nothing was charged for this call. A call that is declined, missed, cancelled or fails to connect costs the devotee nothing.</p>;
  }
  return (
    <div>
      <h3 className="feat-subhead">
        Charges{s.minutes ? ` · ${s.minutes} started minute${s.minutes === 1 ? '' : 's'}` : ''}
        {s.rate ? ` at ${s.rate} coins/min` : ''}
      </h3>
      {s.schedule.length > 0 ? (
        <div className="call-minutes">
          <DataTable label="Minute-by-minute charges" minWidth={0}>
            <thead>
              <tr>
                <th>Minute</th>
                <th className="num">Charged</th>
                <th className="num">Running total</th>
              </tr>
            </thead>
            <tbody>
              {s.schedule.map((r) => (
                <tr key={r.minute}>
                  <td>Minute {r.minute}</td>
                  <td className="num">{formatCoins(r.coins)}</td>
                  <td className="num">{formatCoins(r.running)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      ) : (
        <p className="ui-field__hint">{formatCoins(s.coins)} coins were charged in total. The per-minute split is not available for this call.</p>
      )}
      <p className="ui-field__hint" style={{ marginTop: 8 }}>
        Each started minute is charged when the minute begins, at the rate the call started with.
      </p>
    </div>
  );
}
