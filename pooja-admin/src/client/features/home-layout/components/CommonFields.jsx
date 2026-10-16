import { Field } from '../../../ui/index.js';
import { LANGUAGES, fromInput, toInput } from '../lib/layout.js';
import { ActionField } from './ActionField.jsx';
import { AudienceChips } from './AudienceChips.jsx';
import { useBuilder } from './BuilderContext.js';

/** The band colour: the registry's tones as swatches (the name is the accessible label), plus "none". */
export function ToneSwatches({ value, onChange, disabled }) {
  const { reg } = useBuilder();
  const tones = ['', ...reg.tones];
  return (
    <div className="hl-swatches" role="radiogroup" aria-label="Colour">
      {tones.map((t) => (
        <button key={t || 'none'} type="button" role="radio" aria-checked={(value || '') === t} aria-label={t || 'No colour'} title={t || 'No colour'} disabled={disabled} className={`hl-swatch hl2-swatch ${t ? `hl-tone-${t}` : 'hl2-swatch--none'}`} onClick={() => onChange(t)} />
      ))}
    </div>
  );
}

/** Subtitle (both languages), the Hindi title and the colour: what the LOOK group's one title field leaves out. */
export function MoreText({ block, onChange }) {
  const { dis, err, reg } = useBuilder();
  const f = (key, label, extra) => <Field key={key} label={label} value={block[key]} maxLength={reg.limits.text} error={err(key)} onChange={(v) => onChange({ [key]: v })} {...dis} {...extra} />;
  return (
    <div className="hl2-fields">
      {f('titleHi', 'Section title (Hindi)')}
      <div className="hs-pair">{f('subtitle', 'Subtitle')}{f('subtitleHi', 'Subtitle (Hindi)')}</div>
      <div className="ui-field">
        <span className="ui-field__label">Colour</span>
        <ToneSwatches value={block.tone} onChange={(t) => onChange({ tone: t })} disabled={!!dis.disabled} />
        {err('tone') && <p className="ui-field__error">{err('tone')}</p>}
      </div>
    </div>
  );
}

/**
 * "Who sees this section": audience chips, language, the dates (India time) and the feature flag.
 * `audience` is evaluated on the phone; the rest the server filters.
 */
export function WhoSees({ block, onChange }) {
  const { reg, dis, err } = useBuilder();
  const date = (key, label, blank) => (
    <Field label={label} type="datetime-local" value={toInput(block[key])} error={err(key)} hint={blank} onChange={(v) => onChange({ [key]: fromInput(v) })} {...dis} />
  );
  return (
    <div className="hl2-fields">
      <AudienceChips value={block.audience} audiences={reg.audiences} onChange={(a) => onChange({ audience: a })} disabled={!!dis.disabled} label="Who sees this section" />
      {err('audience') && <p className="ui-field__error" role="alert">{err('audience')}</p>}
      <div className="hl3-trio">
        <Field label="Language" type="select" value={block.language || 'all'} options={LANGUAGES} error={err('language')} onChange={(v) => onChange({ language: v })} {...dis} />
        {date('startsAt', 'Show from', 'Blank = always. India time.')}
        {date('endsAt', 'Until', 'Blank = no end.')}
      </div>
      <Field label="Only while feature flag is on" type="select" value={block.flag || ''} error={err('flag')} hint="Hidden when the flag is switched off." onChange={(v) => onChange({ flag: v })} {...dis}>
        <option value="">No flag</option>
        {reg.flags.map((k) => <option key={k} value={k}>{k}</option>)}
        {block.flag && !reg.flags.includes(block.flag) && <option value={block.flag}>{block.flag}</option>}
      </Field>
    </div>
  );
}

/** The block's own tap target ("see all", footer or the whole block) and its label. */
export function ActionFields({ block, onChange }) {
  const { dis, err } = useBuilder();
  return (
    <div className="hl2-fields">
      <ActionField label="When tapped" value={block.action} path="action" onChange={(a) => onChange({ action: a })} hint="Where “see all”, the footer or the whole block goes." />
      <div className="hs-pair">
        <Field label="Button label" value={block.actionLabel} error={err('actionLabel')} onChange={(v) => onChange({ actionLabel: v })} {...dis} />
        <Field label="Button label (Hindi)" value={block.actionLabelHi} error={err('actionLabelHi')} onChange={(v) => onChange({ actionLabelHi: v })} {...dis} />
      </div>
    </div>
  );
}
