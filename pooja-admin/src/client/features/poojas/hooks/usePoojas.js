import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { idOf } from '../../../lib/ids.js';
import { useToast } from '../../../ui/index.js';
import { duplicateOf } from '../lib/pooja.js';

const EMPTY_FILTERS = { q: '', status: '', temple: '', festival: '' };

/** The pooja list, its filters, and the writes that happen from the table (switch, duplicate, delete, import). */
export function usePoojas(nameOf) {
  const toast = useToast();
  const list = useLoader(() => api.poojas.list());
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [busy, setBusy] = useState('');
  const all = list.data || [];

  const q = filters.q.trim().toLowerCase();
  const rows = all.filter((p) => {
    if (filters.status && p.status !== filters.status) return false;
    if (filters.temple && p.templeSlug !== filters.temple) return false;
    if (filters.festival && p.festivalSlug !== filters.festival) return false;
    if (!q) return true;
    return [p.title, p.titleHi, p.slug, nameOf('temples', p.templeSlug), nameOf('festivals', p.festivalSlug)].some((x) => String(x || '').toLowerCase().includes(q));
  });

  const guard = async (id, what, fn) => {
    setBusy(id);
    try {
      await fn();
      return true;
    } catch (e) {
      toast.error(`${what} ${e.message}`);
      return false;
    } finally {
      setBusy('');
    }
  };

  const toggle = async (p) => {
    const next = !p.enabled;
    list.setData((rs) => rs.map((r) => (idOf(r) === idOf(p) ? { ...r, enabled: next } : r)));
    const ok = await guard(idOf(p), 'Could not change that.', () => api.poojas.update(idOf(p), { enabled: next }));
    // Status is computed server-side from `enabled`, so re-read either way.
    await list.reload();
    return ok;
  };

  const duplicate = async (p) => {
    const ok = await guard(idOf(p), 'Could not duplicate.', async () => {
      const full = await api.poojas.get(idOf(p));
      await api.poojas.create(duplicateOf(full));
    });
    if (ok) toast.success('Duplicated as a hidden draft');
    await list.reload();
  };

  const remove = async (p) => {
    const ok = await guard(idOf(p), 'Could not delete.', () => api.poojas.remove(idOf(p)));
    if (ok) toast.success('Deleted');
    await list.reload();
  };

  const importSevas = async () => {
    const ok = await guard('import', 'Import failed.', async () => {
      const r = await api.poojas.importSevas();
      toast.success(`Imported ${r?.created ?? 0} from sevas${r?.skipped ? `, ${r.skipped} already there` : ''}`);
    });
    if (ok) await list.reload();
  };

  return { rows, total: all.length, status: list.status, error: list.error, offline: list.offline, reload: list.reload, filters, setFilter: (k, v) => setFilters((f) => ({ ...f, [k]: v })), clearFilters: () => setFilters(EMPTY_FILTERS), busy, toggle, duplicate, remove, importSevas };
}
