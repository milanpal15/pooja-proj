import { useState } from 'react';

import { useAccess } from '../../lib/access/index.js';
import { Banner, Button } from '../../ui/index.js';
import { todayKey } from '../../lib/dates.js';
import { useBillingRules } from '../../lib/hooks/useBillingRules.js';
import { BillingRulesForm } from './components/BillingRulesForm.jsx';
import { BillingRulesView } from './components/BillingRulesView.jsx';
import { CallDetailModal } from './components/CallDetailModal/index.js';
import { CallTable } from './components/CallTable.jsx';
import { LiveCallBanner } from './components/LiveCallBanner.jsx';
import { MarkPaidModal } from './components/MarkPaidModal.jsx';
import { PayoutsPanel } from './components/PayoutsPanel.jsx';
import { useCalls } from './hooks/useCalls.js';
import { usePayouts } from './hooks/usePayouts.js';

/**
 * Calls & Payouts, in three sections by area (DESIGN.md §21.3): the call log
 * and live calls (`calls`), payouts (`payouts`), billing rules (`money`). Each
 * shows only when viewable and loses its actions without `edit`.
 */
export function CallsPage() {
  const access = useAccess();
  const [filters, setFilters] = useState({ from: todayKey(), to: '', outcome: '' });
  const showCalls = access.canView('calls');
  const showPayouts = access.canView('payouts');
  const showRules = access.canView('money');
  const calls = useCalls(filters, { enabled: showCalls });
  const payouts = usePayouts({ enabled: showPayouts });
  const rules = useBillingRules({ enabled: showRules });
  const [detail, setDetail] = useState(null);
  const [paying, setPaying] = useState(null);
  const { live } = calls.data;
  const callsReadOnly = !access.canEdit('calls');
  const payoutsReadOnly = !access.canEdit('payouts');

  return (
    <div className="ui-page">
      <p className="content-lede">Every call with what it cost and why it ended, plus what each astrologer is owed.</p>
      {showCalls && calls.status === 'stale' && (
        <Banner action={<Button size="sm" variant="secondary" onClick={calls.actions.reload}>Refresh</Button>}>
          Couldn't refresh. Live calls may be out of date.
        </Banner>
      )}

      {showCalls &&
        live.map((c) => (
          <LiveCallBanner key={c.id} call={c} count={live.length} readOnly={callsReadOnly} onEnd={calls.actions.endCall} />
        ))}

      {showCalls && (
        <CallTable calls={calls.data.calls} status={calls.status} error={calls.error} offline={calls.offline} filters={filters} onFilters={setFilters} onDetails={setDetail} onRetry={calls.actions.reload} />
      )}

      {(showPayouts || showRules) && (
        <div className="ui-row">
          {showPayouts && (
            <PayoutsPanel rows={payouts.data} status={payouts.status} error={payouts.error} offline={payouts.offline} readOnly={payoutsReadOnly} onPay={setPaying} onRetry={payouts.actions.reload} />
          )}
          {showRules && access.canEdit('money') && (
            <BillingRulesForm rules={rules.rules} status={rules.status} error={rules.error} offline={rules.offline} onSave={rules.save} onRetry={rules.reload} />
          )}
          {showRules && !access.canEdit('money') && (
            <BillingRulesView rules={rules.rules} status={rules.status} error={rules.error} offline={rules.offline} onRetry={rules.reload} />
          )}
        </div>
      )}

      {detail && <CallDetailModal call={detail} readOnly={callsReadOnly} onRefund={calls.actions.refund} onClose={() => setDetail(null)} />}
      {paying && !payoutsReadOnly && <MarkPaidModal row={paying} onSave={payouts.actions.markPaid} onClose={() => setPaying(null)} />}
    </div>
  );
}
