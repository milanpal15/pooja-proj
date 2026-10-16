import { createHash } from 'node:crypto';

/** Weak ETag over the exact JSON body. Catalog's `/public/home` and the mobile BFF's `/api/home` both use it, so they agree. */
export const jsonEtag = (body) => `W/"${createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 20)}"`;

/**
 * Does an `If-None-Match` header match this ETag? Weak comparison, a list, or `*`. Done by hand rather than via `req.fresh`
 * because a browser reload (and Node's fetch) sends `Cache-Control: no-cache` WITH `If-None-Match`, which Express treats as "not fresh".
 */
export function etagMatches(header, etag) {
  if (typeof header !== 'string' || !header) return false;
  if (header.trim() === '*') return true;
  const bare = (t) => t.trim().replace(/^W\//, '');
  return header.split(',').some((t) => bare(t) === bare(etag));
}
