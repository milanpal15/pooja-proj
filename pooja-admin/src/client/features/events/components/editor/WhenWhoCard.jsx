import { Banner, Button, Card, Field, IconButton, Switch } from '../../../../ui/index.js';
import { FIELD_TYPES, REG_MODES, SCHEDULE_MODES, blankField } from '../../lib/events.js';
import { useEd } from './EditorContext.js';

function RegistrationFields() {
  const { d, setBlock, ro, dis, err } = useEd();
  const fields = d.registration.fields;
  const put = (next) => setBlock('registration', { fields: next });
  const patch = (i, p) => put(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return (
    <div className="lv-aartis">
      <h4 className="ev-sub">Questions on joining</h4>
      {fields.length === 0 && <p className="ui-field__hint">No questions. Devotees just tap Join.</p>}
      <ul className="lv-aartis__list" aria-label="Registration questions">
        {fields.map((f, i) => (
          <li key={f.key} className="ev-fieldrow">
            <div className="hs-pair">
              <Field label={`Question ${i + 1}`} value={f.label} error={err(`registration.fields.${i}.label`)} onChange={(v) => patch(i, { label: v })} {...dis} />
              <Field label="Question (Hindi)" value={f.labelHi} onChange={(v) => patch(i, { labelHi: v })} {...dis} />
            </div>
            <div className="hs-pair">
              <Field label="Answer type" type="select" value={f.type} options={FIELD_TYPES} onChange={(v) => patch(i, { type: v })} {...dis} />
              <Switch variant="card" label="Required" checked={f.required} onChange={(v) => patch(i, { required: v })} {...dis} />
            </div>
            {f.type === 'choice' && (
              <Field label="Options" type="textarea" hint="One option per line" value={f.options.join('\n')} error={err(`registration.fields.${i}.options`)} onChange={(v) => patch(i, { options: v.split('\n') })} {...dis} />
            )}
            {!ro && <IconButton label={`Remove question ${i + 1}`} onClick={() => put(fields.filter((_, j) => j !== i))}>×</IconButton>}
          </li>
        ))}
      </ul>
      {!ro && <Button variant="outline" size="sm" onClick={() => put([...fields, blankField(fields.map((f) => f.key))])}>+ Add question</Button>}
    </div>
  );
}

/** Schedule, registration and venue — each shown only while its section is on. */
export function WhenWhoCard() {
  const { d, setBlock, dis, err } = useEd();
  const has = (id) => d.blocks.includes(id);
  if (!has('schedule') && !has('registration') && !has('venue')) return null;
  const s = d.schedule;
  const r = d.registration;
  const v = d.venue;
  return (
    <>
      {has('schedule') && (
        <Card title="Schedule">
          <div className="hs-form">
            <Field label="Runs" type="select" value={s.mode} options={SCHEDULE_MODES} onChange={(x) => setBlock('schedule', { mode: x })} {...dis} />
            {s.mode !== 'always' && (
              <div className="hs-pair">
                <Field label="Starts (IST)" type="datetime-local" value={s.startsAt} error={err('schedule.startsAt')} onChange={(x) => setBlock('schedule', { startsAt: x })} {...dis} />
                <Field label="Ends (IST)" type="datetime-local" value={s.endsAt} error={err('schedule.endsAt')} onChange={(x) => setBlock('schedule', { endsAt: x })} {...dis} />
              </div>
            )}
            {s.mode === 'always' && <p className="ui-field__hint">An always-on event is live for as long as it is shown. All times are Indian Standard Time.</p>}
          </div>
        </Card>
      )}
      {has('registration') && (
        <Card title="Registration">
          <div className="hs-form">
            <div className="hs-pair">
              <Field label="Joining" type="select" value={r.mode} options={REG_MODES} onChange={(x) => setBlock('registration', { mode: x })} {...dis} />
              <Field label="Capacity" type="number" min="1" placeholder="No limit" value={r.capacity} error={err('registration.capacity')} onChange={(x) => setBlock('registration', { capacity: x })} {...dis} />
            </div>
            {r.mode === 'coins' && <Banner tone="warning">Paid joining arrives in a later release; devotees cannot join this event yet.</Banner>}
            {r.mode === 'coins' && <Field label="Coins to join" type="number" min="1" value={r.coins} error={err('registration.coins')} onChange={(x) => setBlock('registration', { coins: x })} {...dis} />}
            <div className="hs-pair">
              <Field label="Opens (IST)" type="datetime-local" value={r.opensAt} error={err('registration.opensAt')} onChange={(x) => setBlock('registration', { opensAt: x })} {...dis} />
              <Field label="Closes (IST)" type="datetime-local" value={r.closesAt} error={err('registration.closesAt')} onChange={(x) => setBlock('registration', { closesAt: x })} {...dis} />
            </div>
            <Switch variant="card" label="Give a QR pass on joining" checked={r.pass} onChange={(x) => setBlock('registration', { pass: x })} {...dis} />
            <RegistrationFields />
          </div>
        </Card>
      )}
      {has('venue') && (
        <Card title="Venue">
          <div className="hs-form">
            <Field label="Venue name" value={v.name} error={err('venue.name')} onChange={(x) => setBlock('venue', { name: x })} {...dis} />
            <div className="hs-pair">
              <Field label="City" value={v.city} onChange={(x) => setBlock('venue', { city: x })} {...dis} />
              <Field label="Organiser" value={v.organiser} onChange={(x) => setBlock('venue', { organiser: x })} {...dis} />
            </div>
            <Field label="Address" value={v.address} onChange={(x) => setBlock('venue', { address: x })} {...dis} />
            <div className="hs-pair">
              <Field label="Latitude" type="number" step="any" value={v.lat} error={err('venue.lat')} onChange={(x) => setBlock('venue', { lat: x })} {...dis} />
              <Field label="Longitude" type="number" step="any" value={v.lng} error={err('venue.lng')} onChange={(x) => setBlock('venue', { lng: x })} {...dis} />
            </div>
            <Field label="Online link" type="url" hint="For events that are also (or only) online" value={v.onlineUrl} error={err('venue.onlineUrl')} onChange={(x) => setBlock('venue', { onlineUrl: x })} {...dis} />
          </div>
        </Card>
      )}
    </>
  );
}
