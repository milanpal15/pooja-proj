import { Badge, Field, Switch } from '../../../../ui/index.js';
import { statusLine } from '../../lib/presence.js';
import { PricingFieldset } from './PricingFieldset.jsx';

/** The fields of the add/edit dialog. `astrologer` is null when adding. */
export function AstrologerForm({ form, errors, onChange, astrologer, formError }) {
  const onField = (key) => (value) => onChange({ ...form, [key]: value });
  const status = statusLine(astrologer);
  return (
    <>
      {formError && (
        <p className="feat-form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="feat-grid2" style={{ alignItems: 'start' }}>
        <Field label="Display name" value={form.name} onChange={onField('name')} error={errors.name} />
        <Field label="Years of experience" type="number" min="0" step="1" value={form.yearsExperience} onChange={onField('yearsExperience')} error={errors.yearsExperience} inputMode="numeric" />
        <Field label="Specialities" value={form.specialities} onChange={onField('specialities')} hint="Separate with commas." />
        <Field label="Languages" value={form.languages} onChange={onField('languages')} hint="Separate with commas." />
      </div>
      <Field label="About (shown to devotees)" type="textarea" value={form.bio} onChange={onField('bio')} />

      <PricingFieldset form={form} errors={errors} onField={onField} />

      <div className="feat-grid2" style={{ alignItems: 'start' }}>
        <Field label="Sign-in email or mobile" value={form.signIn} onChange={onField('signIn')} error={errors.signIn} placeholder="name@gmail.com or +919876543210" autoComplete="off" />
        <div style={{ paddingTop: 25 }}>
          <Switch variant="card" label="Listed in the app" hint="Untick to hide and stop new calls" checked={form.listed} onChange={onField('listed')} />
        </div>
      </div>
      <div className="feat-sign-status">
        <Badge tone={status.tone}>{status.label}</Badge>
        <p>
          The astrologer signs in to the app with this Google account or mobile number. It must match exactly. Their account then opens
          straight in the astrologer view, with no name or date-of-birth page. For a new astrologer this shows{' '}
          <b>Invited · not signed in yet</b> until their first sign-in.
        </p>
      </div>
    </>
  );
}
