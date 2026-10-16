/** What changed between two layout sets, by layout id and block id: History's "compare with draft", and the change count. */

/** Longest increasing subsequence length (indices of the common ids in the other list). */
function lisLength(seq) {
  const tails = [];
  for (const x of seq) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}

/** Blocks of one layout, by id: added, removed, changed (content), moved (not in the longest unchanged run). */
export function compare(a, b) {
  const A = new Map((a?.blocks || []).map((x) => [x.id, x]));
  const B = new Map((b?.blocks || []).map((x) => [x.id, x]));
  const added = [...B.keys()].filter((id) => !A.has(id));
  const removed = [...A.keys()].filter((id) => !B.has(id));
  const changed = [...B.keys()].filter((id) => A.has(id) && JSON.stringify(A.get(id)) !== JSON.stringify(B.get(id)));
  const common = [...B.keys()].filter((id) => A.has(id));
  const inA = new Map([...A.keys()].filter((id) => B.has(id)).map((id, i) => [id, i]));
  const moved = common.length - lisLength(common.map((id) => inA.get(id)));
  return { before: A.size, after: B.size, added, removed, changed, moved, reordered: moved > 0, same: !added.length && !removed.length && !changed.length && !moved };
}

const SETTINGS = ['name', 'enabled', 'audience', 'startsAt', 'endsAt'];
const settingsOf = (l) => JSON.stringify(SETTINGS.map((k) => l?.[k] ?? null));

/**
 * `before` -> `after` as sets. Counted like the server's `changes` (docs/HOME_LAYOUT.md §9.3): a layout added or removed is one;
 * a layout whose name, schedule, audience or switch changed is one; per layout, each block added, removed, moved or changed is one.
 */
export function compareSets(before, after) {
  const A = new Map((before?.layouts || []).map((l) => [l.id, l]));
  const B = new Map((after?.layouts || []).map((l) => [l.id, l]));
  const addedLayouts = [...B.keys()].filter((id) => !A.has(id));
  const removedLayouts = [...A.keys()].filter((id) => !B.has(id));
  const changedLayouts = [];
  const perLayout = [];
  for (const [id, l] of B) {
    if (!A.has(id)) continue;
    if (settingsOf(A.get(id)) !== settingsOf(l)) changedLayouts.push(id);
    const d = compare(A.get(id), l);
    if (!d.same) perLayout.push({ id, name: l.name, ...d });
  }
  const blocks = perLayout.reduce((n, d) => n + d.added.length + d.removed.length + d.changed.length + d.moved, 0);
  const count = addedLayouts.length + removedLayouts.length + changedLayouts.length + blocks;
  return { before: A.size, after: B.size, addedLayouts, removedLayouts, changedLayouts, perLayout, blocks, count, same: count === 0 };
}

export const countChanges = (before, after) => compareSets(before, after).count;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "1 layout added · 2 sections changed · 1 moved" or "No differences". */
export function summarySet(d) {
  if (d.same) return 'No differences';
  const sum = (k) => d.perLayout.reduce((n, x) => n + x[k].length, 0);
  const moved = d.perLayout.reduce((n, x) => n + x.moved, 0);
  return [
    d.addedLayouts.length && `${plural(d.addedLayouts.length, 'layout', 'layouts')} added`,
    d.removedLayouts.length && `${plural(d.removedLayouts.length, 'layout', 'layouts')} removed`,
    d.changedLayouts.length && `${plural(d.changedLayouts.length, 'layout', 'layouts')} re-configured`,
    sum('added') && `${plural(sum('added'), 'section', 'sections')} added`,
    sum('removed') && `${plural(sum('removed'), 'section', 'sections')} removed`,
    sum('changed') && `${plural(sum('changed'), 'section', 'sections')} changed`,
    moved && `${moved} moved`,
  ].filter(Boolean).join(' · ');
}

/** "N changes not published" wording for the header. */
export const changesLabel = (n) => (n > 0 ? `Draft · ${plural(n, 'change', 'changes')} not published` : 'Draft matches the live layout');
