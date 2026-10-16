import { Banner, Button, Card, ChipInput, Field, ReadOnlyBadge, Switch } from '../../../ui/index.js';
import { MAX_MESSAGE } from '../lib/policy.js';

const counter = (s) => `${s.length} / ${MAX_MESSAGE}`;

/** A text box with a "n / 300" counter that turns into the error when over. */
export function CounterField({ label, value, onChange, error, readOnly, hint, ...rest }) {
  return (
    <Field label={label} type="textarea" value={value} onChange={onChange} readOnly={readOnly} rows={3} error={error} hint={`${hint ? `${hint} ` : ''}${counter(value)}`} {...rest} />
  );
}

/**
 * The version policy (docs/RELEASES.md §3). Every box is a build number: the number in `app.json` -> android.versionCode,
 * shown to the operator next to the version name when a release is registered.
 */
export function PolicyCard({ f, set, errors, readOnly, releases, onPreview }) {
  const name = (code) => {
    const r = releases.find((x) => String(x.versionCode) === String(code).trim());
    return r ? `Build ${String(code).trim()} is ${r.versionName}.` : '';
  };
  const num = (key, label, hint) => (
    <Field label={label} type="text" inputMode="numeric" value={f[key]} onChange={(v) => set({ [key]: v })} error={errors[key]} readOnly={readOnly} hint={`${hint}${f[key] && name(f[key]) ? ` ${name(f[key])}` : ''}`} placeholder="none" />
  );
  return (
    <Card
      title="Version policy"
      description="What the server tells each build to do. Builds are identified by their build number."
      actions={
        <>
          {readOnly && <ReadOnlyBadge />}
          <Button variant="outline" onClick={onPreview}>
            Preview on phone
          </Button>
        </>
      }>
      <div className="rel-form">
        <div className="rel-form__row">
          {num('minVersionCode', 'Minimum build', 'Below this: full-screen “Update required”.')}
          {num('recommendedVersionCode', 'Recommended build', 'Below this: a dismissible “Update available”.')}
        </div>
        <ChipInput
          label="Blocked builds"
          value={f.blockedVersionCodes}
          onChange={(v) => set({ blockedVersionCodes: v.sort((a, b) => a - b) })}
          parse={(t) => (/^\d+$/.test(t) ? Number(t) : undefined)}
          format={(v) => { const r = releases.find((x) => x.versionCode === v); return `build ${v}${r ? ` · ${r.versionName}` : ''}`; }}
          placeholder="Build number, then Enter"
          readOnly={readOnly}
          error={errors.blockedVersionCodes}
          hint="Specific broken builds, blocked even when they are above the minimum."
        />
        <div className="rel-form__row">
          {num('minOsApi', 'Android OS notice below API level', 'A notice only, never a block. 26 = Android 8.')}
          <Field label="Grace until" type="datetime-local" value={f.graceUntil} onChange={(v) => set({ graceUntil: v })} error={errors.graceUntil} readOnly={readOnly} hint="Until then, builds below the minimum only see “update by …”. Blank = enforce now." />
        </div>
        <div className="rel-form__row">
          <CounterField label="Message (English)" value={f.message} onChange={(v) => set({ message: v })} error={errors.message} readOnly={readOnly} />
          <CounterField label="Message (हिन्दी)" value={f.messageHi} onChange={(v) => set({ messageHi: v })} error={errors.messageHi} readOnly={readOnly} />
        </div>
        <div className="rel-form__row">
          <Field label="Store link" type="text" value={f.storeUrl} onChange={(v) => set({ storeUrl: v })} error={errors.storeUrl} readOnly={readOnly} hint="The Update button opens this. Blank hides the button." placeholder="https://play.google.com/store/apps/details?id=…" />
          <Field label="Remind again after (days)" type="text" inputMode="numeric" value={f.snoozeDays} onChange={(v) => set({ snoozeDays: v })} error={errors.snoozeDays} readOnly={readOnly} hint="How long “Later” hides the update nudge (1 to 30)." />
        </div>
        <div className="rel-form__unv">
          <Switch variant="card" label="Also block callers that send no version" hint="Old installs from before version reporting would stop working." checked={f.blockUnversioned} disabled={readOnly} onChange={(v) => set({ blockUnversioned: v })} />
          {f.blockUnversioned && <Banner tone="warning">Builds that do not report a version will be refused like an outdated one. Check the Impact preview first.</Banner>}
        </div>
        <p className="rel-failopen" role="note">
          <strong>Fail-open.</strong> If the app cannot reach the server, or the policy cannot be loaded, nobody is blocked: phones keep the last policy they saw
          and carry on. A server outage never locks users out.
        </p>
      </div>
    </Card>
  );
}
