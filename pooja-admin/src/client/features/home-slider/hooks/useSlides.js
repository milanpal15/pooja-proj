import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { idOf } from '../../../lib/ids.js';
import { useToast } from '../../../ui/index.js';
import { byOrder } from '../lib/slide.js';

const listOf = (r) => (Array.isArray(r) ? r : r?.hero ?? r?.slides ?? []);

/**
 * The slides and the writes made from the table: switch, reorder, delete.
 * Switching and reordering are optimistic and roll back (re-read) when refused.
 */
export function useSlides() {
  const toast = useToast();
  const list = useLoader(async () => listOf(await api.hero.list()));
  const slides = (list.data || []).slice().sort(byOrder);

  const fail = async (what, e) => {
    toast.error(`${what} ${e.message}`);
    await list.reload();
  };

  const toggle = async (s) => {
    const next = !s.enabled;
    list.setData((rows) => rows.map((r) => (idOf(r) === idOf(s) ? { ...r, enabled: next } : r)));
    try {
      await api.hero.update(idOf(s), { enabled: next });
    } catch (e) {
      await fail('Could not change that.', e);
    }
  };

  const move = async (from, to) => {
    if (from === to || to < 0 || to >= slides.length) return;
    const next = slides.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    list.setData(next.map((r, i) => ({ ...r, order: (i + 1) * 10 })));
    try {
      await api.hero.reorder(next.map(idOf));
    } catch (e) {
      await fail('Could not reorder.', e);
    }
  };

  const remove = async (s) => {
    try {
      await api.hero.remove(idOf(s));
    } catch (e) {
      toast.error(`Could not delete. ${e.message}`);
      return false;
    }
    toast.success('Slide deleted');
    await list.reload();
    return true;
  };

  return { slides, status: list.status, error: list.error, offline: list.offline, reload: list.reload, toggle, move, remove };
}
