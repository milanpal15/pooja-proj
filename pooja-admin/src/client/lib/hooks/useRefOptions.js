import { api } from '../api/index.js';
import { useLoader } from './useLoader.js';

const option = (label) => (row) => ({ value: row.slug, label: label(row) || row.slug });

/**
 * The temples, festivals and deities other screens pick from, as `<select>`
 * options with a leading "None". A list that fails to load is just empty: the
 * picker still works with what is already stored.
 */
export function useRefOptions() {
  const temples = useLoader(() => api.temples.list());
  const festivals = useLoader(() => api.festivals.list());
  const deities = useLoader(() => api.deities.list());
  const opts = (loader, label) => [{ value: '', label: '—' }, ...(loader.data || []).map(option(label))];
  return {
    temples: opts(temples, (t) => t.name),
    festivals: opts(festivals, (f) => f.name),
    deities: opts(deities, (d) => d.name),
    /** slug -> name, for table cells. */
    nameOf: (kind, slug) => ({ temples, festivals, deities })[kind]?.data?.find((r) => r.slug === slug)?.name || slug || '',
  };
}
