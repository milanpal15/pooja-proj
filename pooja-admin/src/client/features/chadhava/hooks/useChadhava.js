import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { idOf } from '../../../lib/ids.js';
import { useToast } from '../../../ui/index.js';
import { assignKeys } from '../lib/chadhava.js';

/** Strip what the Offerings tab adds to a row (parent info, client ids) before it goes back inside a listing. */
const stored = ({ listingId, listingTitle, listingSlug, category, _cid, _stored, ...o }) => o;

/**
 * Listings and categories, and every write to them. An offering lives inside
 * its listing, so changing one is a PUT of that listing's `offerings` array
 * (two PUTs when it moves between listings — add first, then remove, so a
 * failure in between duplicates rather than loses it).
 */
export function useChadhava() {
  const toast = useToast();
  const listings = useLoader(() => api.chadhavaListings.list());
  const categories = useLoader(() => api.chadhavaCategories.list());
  const rows = listings.data || [];
  const byId = (id) => rows.find((l) => idOf(l) === id);

  const run = async (what, fn, done) => {
    try {
      await fn();
    } catch (e) {
      toast.error(`${what} ${e.message}`);
      await listings.reload();
      return false;
    }
    if (done) toast.success(done);
    await listings.reload();
    return true;
  };

  const saveListing = async (payload) => {
    const id = idOf(payload);
    if (id) await api.chadhavaListings.update(id, payload);
    else await api.chadhavaListings.create(payload);
    toast.success('Saved');
    await listings.reload();
  };

  const toggleListing = (l) => {
    const next = !l.enabled;
    listings.setData((rs) => rs.map((r) => (idOf(r) === idOf(l) ? { ...r, enabled: next } : r)));
    return run('Could not change that.', () => api.chadhavaListings.update(idOf(l), { enabled: next }));
  };

  const removeListing = (l) => run('Could not delete.', () => api.chadhavaListings.remove(idOf(l)), 'Deleted');

  /** Save one offering (new, edited, or moved to another listing). Throws so the panel can stay open. */
  const saveOffering = async (offering, toId) => {
    const target = byId(toId);
    const existing = (target.offerings || []).map(stored);
    const draft = stored(offering);
    const at = existing.findIndex((o) => o.key === offering.key && offering.key && offering.listingId === toId);
    let next;
    if (at >= 0) next = existing.map((o, i) => (i === at ? { ...o, ...draft } : o));
    else {
      const keyed = assignKeys([...existing.map((o) => ({ ...o, _stored: true })), { ...draft, _stored: false, key: offering.listingId === toId ? offering.key : '' }]);
      next = keyed.map(({ _stored, ...o }) => o);
    }
    next = next.map((o, i) => ({ ...o, coins: Number(o.coins), order: i + 1 }));
    await api.chadhavaListings.update(toId, { offerings: next });
    if (offering.listingId && offering.listingId !== toId) {
      const from = byId(offering.listingId);
      await api.chadhavaListings.update(offering.listingId, { offerings: (from.offerings || []).filter((o) => o.key !== offering.key) });
    }
    toast.success('Saved');
    await listings.reload();
  };

  const toggleOffering = (offering) => {
    const l = byId(offering.listingId);
    const offerings = (l.offerings || []).map((o) => (o.key === offering.key ? { ...o, enabled: !(o.enabled !== false) } : o));
    listings.setData((rs) => rs.map((r) => (idOf(r) === offering.listingId ? { ...r, offerings } : r)));
    return run('Could not change that.', () => api.chadhavaListings.update(offering.listingId, { offerings }));
  };

  const removeOffering = (offering) => {
    const l = byId(offering.listingId);
    return run('Could not delete.', () => api.chadhavaListings.update(offering.listingId, { offerings: (l.offerings || []).filter((o) => o.key !== offering.key) }), 'Deleted');
  };

  return {
    listings: rows,
    status: listings.status,
    error: listings.error,
    offline: listings.offline,
    reload: listings.reload,
    categories: categories.data || [],
    saveListing,
    toggleListing,
    removeListing,
    saveOffering,
    toggleOffering,
    removeOffering,
  };
}
