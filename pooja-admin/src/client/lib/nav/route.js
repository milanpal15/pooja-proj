/**
 * The in-house nested hash router, pure (no React, no `location`). A route is `#/<group>/<module>[/<id>…][?k=v]`;
 * Overview is `#/overview`. Every pre-shell link (`#Users`, `#Home%20layout`, `#Coins%20%26%20Wallets`) still
 * resolves to its module and is reported as `legacy` so the shell can rewrite it to the canonical form.
 */

const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** '#/a/b?x=1' -> { path: '/a/b', query: { x: '1' } }; '#Users' -> { path: 'Users', query: {} }. */
export function splitHash(hash) {
  let raw = String(hash ?? '').replace(/^#/, '');
  let search = '';
  const q = raw.indexOf('?');
  if (q >= 0) {
    search = raw.slice(q + 1);
    raw = raw.slice(0, q);
  }
  const query = {};
  for (const part of search.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    query[decode(k)] = decode(v.replace(/\+/g, ' '));
  }
  return { path: decode(raw), query };
}

const segments = (path) => path.split('/').filter(Boolean);

/**
 * @returns one of
 *   { kind:'module', module, rest:[…], query, legacy:bool, canonical:'#/…' }
 *   { kind:'group', group, query, canonical }   ('#/people' -> the shell opens the group's first visible module)
 *   { kind:'notfound', raw }
 */
export function resolveRoute(hash, modules, groups = []) {
  const { path, query } = splitHash(hash);
  const overview = modules.find((m) => !m.group);
  if (!path || path === '/') {
    return overview ? { kind: 'module', module: overview, rest: [], query, legacy: false, canonical: buildHash(overview.route, [], query) } : { kind: 'notfound', raw: '' };
  }
  if (path.startsWith('/')) {
    const segs = segments(path).map((s) => s.toLowerCase());
    // The longest module route that is a prefix of the path wins; the remainder is the record id etc.
    let best = null;
    for (const m of modules) {
      const ms = segments(m.route);
      if (ms.length <= segs.length && ms.every((s, i) => s === segs[i]) && (!best || ms.length > best.len)) best = { m, len: ms.length };
    }
    if (best) {
      const rest = segments(path).slice(best.len);
      return { kind: 'module', module: best.m, rest, query, legacy: false, canonical: buildHash(best.m.route, rest, query) };
    }
    if (segs.length === 1 && groups.some((g) => g.key === segs[0])) {
      return { kind: 'group', group: segs[0], query, canonical: `#/${segs[0]}` };
    }
    return { kind: 'notfound', raw: path };
  }
  // A pre-shell `#Tab` link.
  const wanted = path.trim().toLowerCase();
  const m = modules.find((x) => x.id.toLowerCase() === wanted) ?? modules.find((x) => x.title.toLowerCase() === wanted);
  if (m) return { kind: 'module', module: m, rest: [], query, legacy: true, canonical: buildHash(m.route, [], query) };
  return { kind: 'notfound', raw: path };
}

/** ('/people/users', ['a b'], {q:'x'}) -> '#/people/users/a%20b?q=x'. */
export function buildHash(route, rest = [], query = {}) {
  const base = [route.replace(/\/+$/, ''), ...rest.map((r) => encodeURIComponent(r))].join('/');
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `#${base}${qs ? `?${qs}` : ''}`;
}

/** Same destination? (ignores trailing slashes and case of the module part). */
export const sameRoute = (a, b) => String(a).replace(/\/+$/, '').toLowerCase() === String(b).replace(/\/+$/, '').toLowerCase();
