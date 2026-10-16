/**
 * v1 -> v2 (docs/HOME_LAYOUT.md section 9): a stored `{schemaVersion: 1, blocks}` becomes `{schemaVersion: 2, layouts: [default]}`.
 * Pure and idempotent: a v2 document is returned as is. Used on every read of the draft / a version (layout.store.js) and once
 * at boot (`migrateStoredLayouts`), so old rows never reach a caller in the old shape.
 *
 * The v2 rules add things a v1 document may not satisfy, so the upgrade repairs them rather than refusing the document:
 * the header and the search are moved to the front, enabled and unfiltered (added when missing, extras dropped), and a
 * quick grid over 12 tiles keeps its first 12. The result is then normalised by the validator; if it STILL does not validate
 * (a document the registry has since moved on from) the structural result is kept, so a read never fails.
 */
import { DEFAULT_LAYOUT_ID, LIMITS, SCHEMA_VERSION } from './registry.js';
import { validateLayout } from './layout.validate.js';

export const isV2 = (raw) => Array.isArray(raw?.layouts);

const FIXED_DEFAULTS = {
  header: { id: 'b-01-header', type: 'header', props: { showWallet: true } },
  search: { id: 'b-02-search', type: 'search', props: { placeholder: 'Search poojas, temples, bhajans', placeholderHi: 'पूजा, मंदिर, भजन खोजें' } },
};

const unfiltered = (b) => ({ ...b, enabled: true, audience: [], startsAt: null, endsAt: null, language: 'all' });

function structural(blocks) {
  const rest = blocks.filter((b) => b && typeof b === 'object');
  const take = (type) => {
    const at = rest.findIndex((b) => b.type === type);
    return at < 0 ? null : rest.splice(at, 1)[0];
  };
  const ids = new Set(rest.map((b) => b.id));
  const fixed = ['header', 'search'].map((type) => {
    const have = take(type);
    if (have) return unfiltered(have);
    let id = FIXED_DEFAULTS[type].id;
    for (let n = 2; ids.has(id); n += 1) id = `${FIXED_DEFAULTS[type].id}-${n}`;
    return { ...FIXED_DEFAULTS[type], id };
  });
  const tail = rest
    .filter((b) => b.type !== 'header' && b.type !== 'search')
    .map((b) => (b.type === 'quick_grid' && b.data?.mode === 'inline' && Array.isArray(b.data.items) && b.data.items.length > LIMITS.gridItems
      ? { ...b, data: { ...b.data, items: b.data.items.slice(0, LIMITS.gridItems) } } : b));
  return [...fixed, ...tail];
}

export function upgradeDocument(raw) {
  if (isV2(raw)) return raw;
  const blocks = structural(Array.isArray(raw?.blocks) ? raw.blocks : []);
  const wrapped = {
    schemaVersion: SCHEMA_VERSION,
    layouts: [{ id: DEFAULT_LAYOUT_ID, name: 'Default layout', enabled: true, audience: [], startsAt: null, endsAt: null, blocks }],
  };
  const { doc } = validateLayout(wrapped);
  if (doc) return doc;
  // Keep what we have, with the v2 additions filled in, so a stored row still reads.
  wrapped.layouts[0].blocks = blocks.map((b) => ({
    ...b, audience: b.audience ?? [],
    ...(b.data?.mode === 'inline' ? { data: { ...b.data, items: (b.data.items ?? []).map((i) => ({ enabled: true, badgeUntil: null, ...i })) } } : {}),
  }));
  return wrapped;
}

export const countBlocks = (doc) => (doc?.layouts ?? []).reduce((n, l) => n + (l.blocks?.length ?? 0), 0);
