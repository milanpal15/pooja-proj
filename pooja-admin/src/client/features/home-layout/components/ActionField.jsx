import { Field } from '../../../ui/index.js';
import { REF_HINT, REF_PLACEHOLDER, refKind } from '../lib/actions.js';
import { useBuilder } from './BuilderContext.js';

/**
 * An Action picker: a type (from the registry) and, where the type takes one, a
 * ref: chosen from the catalogue the dashboard already has (poojas, chadhava
 * listings, temples, events) or typed. "None" stores no action at all.
 * `path` is the error path inside the block, e.g. 'action' or 'data.items.2.action'.
 */
export function ActionField({ label, value, onChange, path, hint }) {
  const { reg, lookups, dis, err } = useBuilder();
  const type = value?.type || '';
  const kind = refKind(type);
  const ref = value?.ref || '';
  const opts = kind !== 'none' && kind !== 'text' ? lookups.options[kind] || [] : [];
  const setType = (t) => onChange(t && t !== 'none' ? { type: t, ref: '' } : t === 'none' ? { type: 'none', ref: '' } : null);
  const types = reg.actions.includes(type) || !type ? reg.actions : [...reg.actions, type];
  return (
    <div className="hl2-action">
      <Field label={label} type="select" value={type} error={err(`${path}.type`) || err(path)} hint={hint} onChange={setType} {...dis}>
        <option value="">None</option>
        {types.filter((t) => t !== 'none').map((t) => <option key={t} value={t}>{t}</option>)}
      </Field>
      {kind !== 'none' && kind !== 'text' && (
        <Field label="Which one" type="select" value={ref} error={err(`${path}.ref`)} onChange={(v) => onChange({ type, ref: v })} {...dis}>
          <option value="">Choose…</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {ref && !opts.some((o) => o.value === ref) && <option value={ref}>{ref}</option>}
        </Field>
      )}
      {kind === 'text' && (
        <Field label="Opens" value={ref} placeholder={REF_PLACEHOLDER[type] || ''} hint={REF_HINT[type]} error={err(`${path}.ref`)} onChange={(v) => onChange({ type, ref: v })} {...dis} />
      )}
    </div>
  );
}
