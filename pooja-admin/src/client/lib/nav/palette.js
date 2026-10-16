/** ⌘K palette logic, pure: rank modules for a query, merge record hits, keep a short recents list. */

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** In-order subsequence match ("hl" in "home layout"). */
const subsequence = (needle, hay) => {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i += 1;
  return i === needle.length;
};

/** 0 = no match; higher is better. */
export function scoreModule(m, query) {
  const q = norm(query).trim();
  if (!q) return 1;
  const title = norm(m.title);
  const id = norm(m.id);
  if (title === q || id === q) return 100;
  if (title.startsWith(q) || id.startsWith(q)) return 85;
  if (title.split(/[\s&]+/).some((w) => w.startsWith(q))) return 70;
  if (title.includes(q) || id.includes(q)) return 55;
  const group = norm(m.breadcrumb?.[0]);
  const kw = norm(m.keywords);
  // Every word of the query must hit the title, group or keywords.
  const words = q.split(/\s+/);
  if (words.every((w) => title.includes(w) || group.includes(w) || kw.includes(w))) return 35;
  if (q.length >= 2 && subsequence(q.replace(/\s+/g, ''), title.replace(/\s+/g, ''))) return 15;
  return 0;
}

/** Modules matching `query`, best first (ties keep sidebar order). `modules` are already filtered by access. */
export function rankModules(modules, query, limit = 12) {
  return modules
    .filter((m) => m.searchable !== false)
    .map((m, i) => ({ m, i, s: scoreModule(m, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.m);
}

/** Case-insensitive contains over the given fields; at most `limit` rows. */
export function filterRecords(rows, query, fields, limit = 6) {
  const q = norm(query).trim();
  if (!q) return [];
  const out = [];
  for (const r of rows) {
    if (fields.some((f) => norm(typeof f === 'function' ? f(r) : r?.[f]).includes(q))) out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** The items the palette lists for a query: grouped sections in display order. */
export function buildSections({ query, modules, recents, userHits = [], templeHits = [] }) {
  const q = query.trim();
  const sections = [];
  if (!q) {
    const recent = (recents ?? []).slice(0, 6);
    if (recent.length) sections.push({ key: 'recent', label: 'Recent', items: recent });
    sections.push({ key: 'modules', label: 'Go to', items: modules.filter((m) => m.searchable !== false).map(moduleItem) });
    return sections;
  }
  const ranked = rankModules(modules, q).map(moduleItem);
  if (ranked.length) sections.push({ key: 'modules', label: 'Go to', items: ranked });
  if (userHits.length) sections.push({ key: 'users', label: 'Users', items: userHits });
  if (templeHits.length) sections.push({ key: 'temples', label: 'Temples', items: templeHits });
  return sections;
}

export const moduleItem = (m) => ({ key: `m:${m.id}`, kind: 'module', title: m.title, sub: m.breadcrumb.slice(0, -1).join(' › '), route: m.route, query: {} });

/** Push to the front of a recents list, dropping duplicates, capped. */
export function pushRecent(list, item, cap = 8) {
  const next = [item, ...(list ?? []).filter((x) => x.key !== item.key)];
  return next.slice(0, cap);
}
