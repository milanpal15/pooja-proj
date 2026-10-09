import { Button } from '../../../ui/index.js';
import { formatDuration, formatWhen } from '../../../lib/dates.js';
import { formatCoins } from '../../../lib/money.js';
import { OutcomeBadge } from './OutcomeBadge.jsx';

export function CallRow({ call, onDetails }) {
  return (
    <tr>
      <td>{formatWhen(call.startedAt)}</td>
      <td>{call.devoteeName || '—'}</td>
      <td>{call.astrologerName || '—'}</td>
      <td>{formatDuration(call.durationSec)}</td>
      <td className="num">
        <b>{formatCoins(call.coins ?? 0)}</b>
      </td>
      <td>
        <OutcomeBadge call={call} />
      </td>
      <td className="actions">
        <Button variant="ghost" size="sm" onClick={() => onDetails(call)} aria-label={`Details of the call with ${call.astrologerName} at ${formatWhen(call.startedAt)}`}>
          Details
        </Button>
      </td>
    </tr>
  );
}
