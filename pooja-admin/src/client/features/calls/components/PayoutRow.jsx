import { Button, ProgressBar, StatusText } from '../../../ui/index.js';
import { formatInr } from '../../../lib/money.js';

export function PayoutRow({ row, readOnly = false, onPay }) {
  const settled = row.duePaise <= 0;
  return (
    <div className="payout-row">
      <div className="payout-row__who">
        <b>{row.name}</b>
        <small>
          Earned {formatInr(row.earnedPaise)} · paid {formatInr(row.paidPaise)}
        </small>
        <ProgressBar label={`${row.name}: paid out`} value={row.paidPaise} max={row.earnedPaise || 1} />
      </div>
      <div className={`payout-row__due ${settled ? 'payout-row__due--clear' : 'payout-row__due--owed'}`}>{formatInr(row.duePaise)}</div>
      {readOnly ? (
        <StatusText on={settled} onLabel="Settled" offLabel="Due" />
      ) : settled ? (
        <Button variant="secondary" size="sm" disabled>
          Settled
        </Button>
      ) : (
        <Button size="sm" onClick={() => onPay(row)} aria-label={`Mark paid: ${row.name}`}>
          Mark paid
        </Button>
      )}
    </div>
  );
}
