import { Button, Field, IconButton } from '../../../ui/index.js';
import { DAY_PRESETS, MAX_AARTIS, blankAarti, daysFromKey, daysKey, daysLabel } from '../lib/live.js';

/** The aarti list: name (EN/HI), time (IST), days. Add and remove; at most MAX_AARTIS. */
export function AartiEditor({ aartis, onChange, error }) {
  const patch = (i, p) => onChange(aartis.map((a, j) => (j === i ? { ...a, ...p } : a)));
  return (
    <div className="lv-aartis">
      <ul className="lv-aartis__list" aria-label="Aartis">
        {aartis.map((a, i) => {
          const key = daysKey(a.days);
          const custom = key.startsWith('custom:');
          return (
            <li key={i} className="lv-aarti">
              <Field label={`Aarti ${i + 1} name`} hideLabel placeholder="Aarti name" value={a.name} onChange={(v) => patch(i, { name: v })} />
              <Field label={`Aarti ${i + 1} name (Hindi)`} hideLabel placeholder="Hindi name" value={a.nameHi} onChange={(v) => patch(i, { nameHi: v })} />
              <Field label={`Aarti ${i + 1} time (IST)`} hideLabel type="time" value={a.time} onChange={(v) => patch(i, { time: v })} />
              <Field label={`Aarti ${i + 1} days`} hideLabel type="select" value={key} onChange={(v) => patch(i, { days: daysFromKey(v) })}>
                {DAY_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                {custom && <option value={key}>{daysLabel(a.days)}</option>}
              </Field>
              <IconButton label={`Remove aarti ${i + 1}`} onClick={() => onChange(aartis.filter((_, j) => j !== i))}>×</IconButton>
            </li>
          );
        })}
      </ul>
      {error && <p className="ui-field__error">{error}</p>}
      <Button variant="outline" size="sm" disabled={aartis.length >= MAX_AARTIS} onClick={() => onChange([...aartis, blankAarti()])}>
        + Add aarti
      </Button>
      <p className="ui-field__hint">Times are Indian Standard Time. Devotees who tap Remind me get a notification 10 minutes before each aarti.</p>
    </div>
  );
}
