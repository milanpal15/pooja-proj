/**
 * "N changes not published" (docs/HOME_LAYOUT.md section 9.3): the number of differences between the draft set and the
 * published set. Counted by id:
 *   - a layout added or removed = 1 (its blocks are not counted again);
 *   - for a layout in both: renamed 1, enabled toggled 1, schedule changed 1, audience changed 1, moved in priority 1;
 *   - for each such layout, per block id: added 1, removed 1, moved 1 (the fewest blocks that must jump to turn one
 *     order into the other, i.e. a single drag is 1), changed 1 (any other field, including enabled / audience / items).
 * `dirty` is `changes > 0`. If the two sets differ in a way none of the rules sees, the count is still at least 1.
 */
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const same = (a, b) => canon(a ?? null) === canon(b ?? null);

/** Entries of `order` (ids in published order) that must move: common ids minus the longest run already in order. */
function moves(published, draft) {
  const inDraft = new Set(draft);
  const common = published.filter((id) => inDraft.has(id));
  const inPublished = new Set(published);
  const rank = new Map(draft.filter((id) => inPublished.has(id)).map((id, i) => [id, i]));
  const seq = common.map((id) => rank.get(id));
  const tails = []; // patience sorting: length of the longest increasing subsequence
  for (const x of seq) {
    let lo = 0; let hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < x) lo = mid + 1; else hi = mid; }
    tails[lo] = x;
  }
  return common.length - tails.length;
}

export function countChanges(draft, live) {
  const a = live?.layouts ?? [];
  const b = draft?.layouts ?? [];
  const aIds = new Map(a.map((l) => [l.id, l]));
  const bIds = new Map(b.map((l) => [l.id, l]));
  let n = 0;
  for (const id of aIds.keys()) if (!bIds.has(id)) n += 1;
  for (const id of bIds.keys()) if (!aIds.has(id)) n += 1;
  n += moves([...aIds.keys()], [...bIds.keys()]);
  for (const [id, d] of bIds) {
    const p = aIds.get(id);
    if (!p) continue;
    if (p.name !== d.name) n += 1;
    if (p.enabled !== d.enabled) n += 1;
    if (p.startsAt !== d.startsAt || p.endsAt !== d.endsAt) n += 1;
    if (!same(p.audience, d.audience)) n += 1;
    const pb = new Map((p.blocks ?? []).map((x) => [x.id, x]));
    const db = new Map((d.blocks ?? []).map((x) => [x.id, x]));
    for (const k of pb.keys()) if (!db.has(k)) n += 1;
    for (const k of db.keys()) if (!pb.has(k)) n += 1;
    n += moves([...pb.keys()], [...db.keys()]);
    for (const [k, x] of db) if (pb.has(k) && !same(pb.get(k), x)) n += 1;
  }
  if (n === 0 && !same({ l: a }, { l: b })) n = 1;
  return n;
}
