import { Field, Segmented, Switch } from '../../../ui/index.js';
import { schemaFields } from '../lib/registry.js';
import { useBuilder } from './BuilderContext.js';

const listText = (v) => (Array.isArray(v) ? v.join(', ') : v ?? '');

/**
 * Fields drawn from a registry schema (a block type's `props`, a source's
 * `params`). Generic on purpose: there is no code here for any particular
 * type or source. `base` is the error path prefix ('props' / 'data.params').
 */
export function SchemaFields({ schema, values, onChange, base }) {
  const { dis, err, lookups } = useBuilder();
  const fields = schemaFields(schema);
  if (!fields.length) return null;
  const put = (key, v) => onChange({ ...values, [key]: v });
  return (
    <div className="hl2-fields">
      {fields.map((f) => {
        const error = err(`${base}.${f.key}`);
        const value = values[f.key] ?? '';
        if (f.type === 'boolean') return <Switch key={f.key} variant="card" label={f.label} hint={f.hint} checked={!!values[f.key]} onChange={(v) => put(f.key, v)} {...dis} />;
        if (f.type === 'select' && f.segmented && !f.ref) {
          const cur = String(value);
          return (
            <div key={f.key} className="ui-field">
              <span className="ui-field__label">{f.label}</span>
              {dis.disabled
                ? <span className="ui-readout">{f.options.find((o) => o.value === cur)?.label || cur || 'Default'}</span>
                : <Segmented label={f.label} options={f.options} value={cur} onChange={(v) => put(f.key, v)} />}
              {f.hint && !error && <p className="ui-field__hint">{f.hint}</p>}
              {error && <p className="ui-field__error">{error}</p>}
            </div>
          );
        }
        if (f.type === 'select') {
          return (
            <Field key={f.key} label={f.label} type="select" value={String(value)} hint={f.hint} error={error} onChange={(v) => put(f.key, v)} {...dis}>
              {!f.required && <option value="">Default</option>}
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              {value !== '' && !f.options.some((o) => o.value === String(value)) && <option value={value}>{String(value)}</option>}
            </Field>
          );
        }
        const opts = f.ref ? lookups.options[f.ref] : null;
        if (opts && f.type === 'text') {
          return (
            <Field key={f.key} label={f.label} type="select" value={value} hint={f.hint} error={error} onChange={(v) => put(f.key, v)} {...dis}>
              <option value="">Any</option>
              {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              {value && !opts.some((o) => o.value === value) && <option value={value}>{value}</option>}
            </Field>
          );
        }
        if (f.type === 'list') return <Field key={f.key} label={f.label} value={listText(values[f.key])} hint={f.hint || 'Separate with commas'} error={error} placeholder={f.placeholder} onChange={(v) => put(f.key, v)} {...dis} />;
        if (f.type === 'number') return <Field key={f.key} label={f.label} type="number" min={f.min} max={f.max} step={f.integer ? 1 : 'any'} value={value} hint={f.hint} error={error} placeholder={f.placeholder} onChange={(v) => put(f.key, v)} {...dis} />;
        return <Field key={f.key} label={f.label} type={f.type === 'textarea' ? 'textarea' : 'text'} rows={f.type === 'textarea' ? 6 : undefined} value={value} hint={f.hint} error={error} placeholder={f.placeholder} maxLength={f.maxLength} onChange={(v) => put(f.key, v)} {...dis} />;
      })}
    </div>
  );
}
