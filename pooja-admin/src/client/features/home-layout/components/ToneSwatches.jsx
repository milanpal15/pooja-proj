import { TONES } from '../lib/sources.js';

/** The band colour: five named swatches (the name is the accessible label). */
export function ToneSwatches({ value, onChange }) {
  return (
    <div className="hl-swatches" role="radiogroup" aria-label="Band colour">
      {TONES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={value === t.value}
          aria-label={t.label}
          title={t.label}
          className={`hl-swatch hl-tone-${t.value}`}
          onClick={() => onChange(t.value)}
        />
      ))}
    </div>
  );
}
