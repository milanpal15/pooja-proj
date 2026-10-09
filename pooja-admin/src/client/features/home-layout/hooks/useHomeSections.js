import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { idOf } from '../../../lib/ids.js';
import { useToast } from '../../../ui/index.js';

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

/**
 * The Home layout and every write to it. Switching and reordering are
 * optimistic and roll back (with the API's sentence) when refused; saving a
 * section re-fetches, since the server rewrites `order`.
 */
export function useHomeSections() {
  const toast = useToast();
  const list = useLoader(() => api.homeSections.list());
  // Only for the hero row's "N slides · M scheduled"; the page works without it.
  const hero = useLoader(() => api.hero.list());
  const sections = (list.data || []).slice().sort(byOrder);

  const fail = async (what, e) => {
    toast.error(`${what} ${e.message}`);
    await list.reload();
  };

  const toggle = async (section) => {
    const next = !section.enabled;
    list.setData((rows) => rows.map((r) => (idOf(r) === idOf(section) ? { ...r, enabled: next } : r)));
    try {
      await api.homeSections.update(idOf(section), { enabled: next });
    } catch (e) {
      await fail('Could not change that.', e);
    }
  };

  /** Move the section at `from` to index `to`, then tell the server the new order. */
  const move = async (from, to) => {
    if (from === to || to < 0 || to >= sections.length) return;
    const next = sections.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    list.setData(next.map((r, i) => ({ ...r, order: (i + 1) * 10 })));
    try {
      await api.homeSections.reorder(next.map(idOf));
    } catch (e) {
      await fail('Could not reorder.', e);
    }
  };

  const save = async (section) => {
    const id = idOf(section);
    if (id) await api.homeSections.update(id, section);
    else await api.homeSections.create(section);
    toast.success('Saved');
    await list.reload();
  };

  const remove = async (section) => {
    try {
      await api.homeSections.remove(idOf(section));
    } catch (e) {
      toast.error(`Could not delete. ${e.message}`);
      return;
    }
    toast.success('Deleted');
    await list.reload();
  };

  return { sections, status: list.status, error: list.error, offline: list.offline, reload: list.reload, heroSlides: hero.data, toggle, move, save, remove };
}
