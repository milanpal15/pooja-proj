import { Badge, Button, useConfirm, useToast } from '../../../ui/index.js';
import { formatCoins } from '../../../lib/money.js';

const minutesSoFar = (c) => Math.max(0, Math.floor((Date.now() - new Date(c.startedAt).getTime()) / 60000));

/** One call happening right now, with a way to cut it off. */
export function LiveCallBanner({ call, count, readOnly = false, onEnd }) {
  const confirm = useConfirm();
  const toast = useToast();
  const mins = c => minutesSoFar(c);
  const end = async () => {
    const ok = await confirm({
      title: 'End this call now?',
      message: `${call.devoteeName} and ${call.astrologerName} are connected. Ending it stops billing from the next minute. Minutes already charged are not refunded automatically.`,
      confirmLabel: 'End call',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await onEnd(call);
      toast.success('Call ended');
    } catch (e) {
      toast.error(`Could not end the call. ${e.message}`);
    }
  };
  return (
    <section className="call-live" aria-label="Live call">
      <Badge tone="live">LIVE · {count}</Badge>
      <div className="call-live__text">
        <b>
          {call.devoteeName} ↔ {call.astrologerName}
        </b>
        {' · '}
        {call.status === 'requested' ? 'ringing' : `${mins(call)} min so far`} · {formatCoins(call.coins)} coins charged
      </div>
      {!readOnly && (
        <Button variant="outline" onClick={end} style={{ borderColor: 'var(--error-ink)', color: 'var(--error-ink)' }}>
          End call
        </Button>
      )}
    </section>
  );
}
