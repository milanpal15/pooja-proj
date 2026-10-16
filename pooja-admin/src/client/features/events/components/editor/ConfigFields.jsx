import { Field, Switch } from '../../../../ui/index.js';
import { fieldsOf } from '../../lib/schema.js';
import { useEd } from './EditorContext.js';

/**
 * A task's settings, drawn from its kind's `configSchema` (docs/EVENTS.md §4).
 * Generic on purpose: there is no code here for any particular kind. A field
 * that names a catalogue (`ref`) gets a select of that catalogue.
 */
export function ConfigFields({ schema, config, onChange, path }) {
  const { lookups, dis, err } = useEd();
  const fields = fieldsOf(schema);
  if (!fields.length) return null;
  const put = (key, v) => onChange({ ...config, [key]: v });
  return (
    <div className="ev-config">
      {fields.map((f) => {
        const error = err(`${path}.${f.key}`);
        const value = config[f.key] ?? '';
        if (f.type === 'boolean') return <Switch key={f.key} variant="card" label={f.label} hint={f.hint} checked={!!config[f.key]} onChange={(v) => put(f.key, v)} {...dis} />;
        if (f.type === 'ref' || f.type === 'select') {
          const opts = f.type === 'ref' ? lookups.options[f.ref] || [] : f.options;
          return (
            <Field key={f.key} label={f.label} type="select" value={value} hint={f.hint} error={error} onChange={(v) => put(f.key, v)} {...dis}>
              <option value="">{f.required ? 'Choose…' : 'None'}</option>
              {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              {value && !opts.some((o) => o.value === value) && <option value={value}>{value}</option>}
            </Field>
          );
        }
        return (
          <Field key={f.key} label={f.label} type={f.type === 'number' ? 'number' : 'text'} min={f.min} max={f.max} step={f.integer ? 1 : 'any'}
            placeholder={f.placeholder} hint={f.hint} value={value} error={error} onChange={(v) => put(f.key, v)} {...dis} />
        );
      })}
    </div>
  );
}
