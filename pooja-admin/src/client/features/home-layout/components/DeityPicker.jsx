import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { Switch, TableSkeleton } from '../../../ui/index.js';

/** Deity knowledge: which Knowledge entries the block shows (stored as items[].deitySlug, in pick order). */
export function DeityPicker({ items, error, onChange }) {
  const deities = useLoader(() => api.deities.list());
  if (deities.status === 'loading') return <TableSkeleton rows={3} />;
  const chosen = items.map((i) => i.deitySlug);
  const toggle = (slug, on) => onChange(on ? [...items, { deitySlug: slug, title: '' }] : items.filter((i) => i.deitySlug !== slug));
  return (
    <div className="hl-deities" role="group" aria-label="Deities">
      {(deities.data || []).map((d) => (
        <Switch key={d.slug} variant="card" label={d.name || d.slug} hint={d.slug} checked={chosen.includes(d.slug)} onChange={(on) => toggle(d.slug, on)} />
      ))}
      {deities.status === 'error' && <p className="ui-field__error">Couldn’t load deities. {deities.error}</p>}
      {error && (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
