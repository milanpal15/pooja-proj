/** Where a dashboard-authored link goes. */
export type Target =
  | { kind: 'route'; path: string }
  | { kind: 'external'; url: string };

/**
 * Resolve an href the dashboard stored.
 *
 *   /pooja/x        -> in-app route
 *   bhakti://pooja  -> in-app route (/pooja) — the form used inside HTML slides
 *   https://…       -> opened in the browser
 *
 * Anything else (http:, javascript:, data:, a bare word) is refused — null — so
 * a typo or a hostile value in the dashboard cannot launch an arbitrary scheme.
 */
export function resolveHref(href: string | null | undefined): Target | null {
  const h = (href ?? '').trim();
  if (!h) return null;
  if (/^bhakti:\/\//i.test(h)) {
    const rest = h.replace(/^bhakti:\/\//i, '').replace(/^\/+/, '');
    return rest ? { kind: 'route', path: `/${rest}` } : null;
  }
  if (/^https:\/\//i.test(h)) return { kind: 'external', url: h };
  // A single leading slash only: `//host/x` is a protocol-relative URL, not a route.
  if (h.startsWith('/') && !h.startsWith('//')) return { kind: 'route', path: h };
  return null;
}
