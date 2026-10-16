import { Field } from '../../../ui/index.js';
import { LANGUAGES, fromInput, toInput } from '../lib/layout.js';
import { ActionField } from './ActionField.jsx';
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

/** Title, subtitle (both languages) and the colour. */
export function TextFields({ block, onChange }) {
  const { dis, err, reg } = useBuilder();
  const f = (key, label, extra) => <Field key={key} label={label} value={block[key]} maxLength={reg.limits.text} error={err(key)} onChange={(v) => onChange({ [key]: v })} {...dis} {...extra} />;
  return (
    <div className="hl2-fields">
      <div className="hs-pair">{f('title', 'Title')}{f('titleHi', 'Title (Hindi)')}</div>
      <div className="hs-pair">{f('subtitle', 'Subtitle')}{f('subtitleHi', 'Subtitle (Hindi)')}</div>
      <div className="ui-field">
        <span className="ui-field__label">Colour</span>
        <ToneSwatches value={block.tone} onChange={(t) => onChange({ tone: t })} disabled={!!dis.disabled} />
        {err('tone') && <p className="ui-field__error">{err('tone')}</p>}
      </div>
    </div>
  );
}

/** Who sees the block and when: dates (IST), language, feature flag. */
export function TargetingFields({ block, onChange }) {
  const { reg, dis, err } = useBuilder();
  const date = (key, label) => (
    <Field label={label} type="datetime-local" value={toInput(block[key])} error={err(key)} hint="India time (IST). Blank = no limit." onChange={(v) => onChange({ [key]: fromInput(v) })} {...dis} />
  );
  return (
    <div className="hl2-fields">
      <div className="hs-pair">{date('startsAt', 'Show from')}{date('endsAt', 'Show until')}</div>
      <div className="hs-pair">
        <Field label="Language" type="select" value={block.language || 'all'} options={LANGUAGES} error={err('language')} onChange={(v) => onChange({ language: v })} {...dis} />
        <Field label="Only while feature flag is on" type="select" value={block.flag || ''} error={err('flag')} hint="Hidden when the flag is switched off." onChange={(v) => onChange({ flag: v })} {...dis}>
          <option value="">No flag</option>
          {reg.flags.map((k) => <option key={k} value={k}>{k}</option>)}
          {block.flag && !reg.flags.includes(block.flag) && <option value={block.flag}>{block.flag}</option>}
        </Field>
      </div>
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
