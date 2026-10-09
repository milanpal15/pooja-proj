import { Field, ReadoutField } from '../../../../ui/index.js';
import { astrologerEarns } from '../../lib/earnings-preview.js';

/** Rate, platform share, and what the astrologer keeps — live. */
export function PricingFieldset({ form, errors, onField }) {
  const earns = astrologerEarns(form.ratePerMin, form.platformSharePct);
  return (
    <fieldset className="feat-fieldset">
      <legend>Pricing and payout</legend>
      <div className="feat-grid3">
        <Field label="Rate (coins / minute)" type="number" min="1" step="1" value={form.ratePerMin} onChange={onField('ratePerMin')} error={errors.ratePerMin} inputMode="numeric" />
        <Field label="Platform share (%)" type="number" min="0" max="100" step="1" value={form.platformSharePct} onChange={onField('platformSharePct')} error={errors.platformSharePct} inputMode="numeric" />
        <ReadoutField label="Astrologer earns">{earns === null ? '—' : `${earns} coins/min`}</ReadoutField>
      </div>
      <p>Changes affect calls that start after you save. A call in progress keeps the rate it started with.</p>
    </fieldset>
  );
}
