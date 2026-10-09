import { Button, Modal } from '../../../../ui/index.js';
import { formatDuration, formatWhen } from '../../../../lib/dates.js';
import { formatCoins } from '../../../../lib/money.js';
import { chargeSummary } from '../../lib/charges.js';
import { OutcomeBadge } from '../OutcomeBadge.jsx';
import { ChargeBreakdown } from './ChargeBreakdown.jsx';
import { RefundForm } from './RefundForm.jsx';

/** One call in full: who, how long, why it ended, what it cost, and a refund. */
export function CallDetailModal({ call, readOnly = false, onRefund, onClose }) {
  const s = chargeSummary(call);
  return (
    <Modal open onClose={onClose} title="Call details" subtitle={`${call.devoteeName} with ${call.astrologerName}`} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {readOnly && (
        <p className="ui-ro-note" role="note">
          View only. Your account can look at this call but not refund it.
        </p>
      )}
      <dl className="call-facts">
        <div>
          <dt>Started</dt>
          <dd>{formatWhen(call.startedAt)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{formatDuration(call.durationSec)}</dd>
        </div>
        <div>
          <dt>Outcome</dt>
          <dd>
            <OutcomeBadge call={call} />
          </dd>
        </div>
        <div>
          <dt>Charged</dt>
          <dd>{formatCoins(s.coins)} coins</dd>
        </div>
        {s.refunded > 0 && (
          <div>
            <dt>Refunded</dt>
            <dd>{formatCoins(s.refunded)} coins</dd>
          </div>
        )}
      </dl>
      <ChargeBreakdown call={call} />
      {!readOnly && <RefundForm call={call} maxCoins={s.coins - s.refunded} onRefund={onRefund} onDone={onClose} />}
    </Modal>
  );
}
