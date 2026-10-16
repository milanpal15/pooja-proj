/** What changed between two layouts, by block id: the History drawer's "compare with draft". */
export function compare(a, b) {
  const A = new Map((a?.blocks || []).map((x) => [x.id, x]));
  const B = new Map((b?.blocks || []).map((x) => [x.id, x]));
  const added = [...B.keys()].filter((id) => !A.has(id));
  const removed = [...A.keys()].filter((id) => !B.has(id));
  const changed = [...B.keys()].filter((id) => A.has(id) && JSON.stringify(A.get(id)) !== JSON.stringify(B.get(id)));
  const order = [...B.keys()].filter((id) => A.has(id));
  const was = [...A.keys()].filter((id) => B.has(id));
  const reordered = order.some((id, i) => id !== was[i]);
  return { before: A.size, after: B.size, added, removed, changed, reordered, same: !added.length && !removed.length && !changed.length && !reordered };
}

/** "+2 added · 1 removed · 3 changed · reordered" or "No differences". */
export function summary(d) {
  if (d.same) return 'No differences';
  return [d.added.length && `${d.added.length} added`, d.removed.length && `${d.removed.length} removed`, d.changed.length && `${d.changed.length} changed`, d.reordered && 'reordered'].filter(Boolean).join(' · ');
}
