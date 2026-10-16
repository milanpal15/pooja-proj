import { Banner, Card, ChipInput, Field, ReadOnlyBadge, Switch } from '../../../ui/index.js';
import { CounterField } from './PolicyCard.jsx';

/** Maintenance mode: while on, every signed-out or non-allow-listed caller gets the maintenance screen. */
export function MaintenanceCard({ m, set, errors, readOnly, activeNow }) {
  return (
    <Card title="Maintenance" description="Close the app for everyone except an allow-list, with a message." actions={readOnly ? <ReadOnlyBadge /> : null}>
      <div className="rel-form">
        {activeNow && <Banner tone="warning">Maintenance is ON right now. Phones show the maintenance screen.</Banner>}
        <Switch variant="card" label="Maintenance mode" hint="Turning it OFF applies at once. Turning it ON may need approval." checked={m.enabled} disabled={readOnly} onChange={(v) => set({ enabled: v })} />
        <div className="rel-form__row">
          <CounterField label="Message (English)" value={m.message} onChange={(v) => set({ message: v })} error={errors['maintenance.message']} readOnly={readOnly} />
          <CounterField label="Message (हिन्दी)" value={m.messageHi} onChange={(v) => set({ messageHi: v })} error={errors['maintenance.messageHi']} readOnly={readOnly} />
        </div>
        <Field label="Back by" type="datetime-local" value={m.until} onChange={(v) => set({ until: v })} error={errors['maintenance.until']} readOnly={readOnly} hint="Shown to people, and maintenance switches itself off then. Blank = until you turn it off." />
        <ChipInput
          label="Allow-list (user ids)"
          value={m.allowUids}
          onChange={(v) => set({ allowUids: v })}
          placeholder="Firebase uid, then Enter"
          readOnly={readOnly}
          error={errors['maintenance.allowUids']}
          hint={`These people can still use the app during maintenance (up to 50). ${m.allowUids.length} / 50.`}
        />
      </div>
    </Card>
  );
}
