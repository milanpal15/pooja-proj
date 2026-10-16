import { ServiceError, createServiceClient } from '@bhakti/common';

export class CatalogUnavailable extends Error {
  constructor(reason) {
    super('catalog_unavailable');
    this.name = 'CatalogUnavailable';
    this.reason = reason;
  }
}

const NS = '/internal/catalog';
const bySlug = (rows, slug) => Array.isArray(rows) && rows.some((r) => r?.slug === slug);

/**
 * "Does this thing exist in the catalog?" - the only question the events service asks catalog. Injectable (createApp takes a
 * `catalog` with the same `exists(type, slug)` shape; tests stub it). Uses catalog's EXISTING public routes:
 *   stream   GET /live/:slug                (enabled streams only)
 *   listing  GET /chadhava/listings/:slug   (enabled listings only)
 *   pooja    GET /poojas/:slug              (bookable poojas only)
 *   temple   GET /public/content -> temples (enabled)
 *   aarti    GET /public/content -> aartis  (enabled)
 * A 404 is "no"; anything else that is not an answer (down, timeout, 5xx, no CATALOG_URL) throws CatalogUnavailable.
 */
export function createCatalogClient(config, { fetchImpl, now = () => Date.now(), contentTtlMs = 60_000 } = {}) {
  if (!config.catalogUrl) {
    return { exists: async () => { throw new CatalogUnavailable('CATALOG_URL is not set'); } };
  }
  const client = createServiceClient({
    service: 'catalog', baseUrl: config.catalogUrl, iss: 'events', secret: config.secret, timeoutMs: config.serviceTimeoutMs,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  let content = null; // { at, body }

  async function bundle() {
    if (content && now() - content.at < contentTtlMs) return content.body;
    const body = await client.get(`${NS}/public/content`);
    content = { at: now(), body };
    return body;
  }

  const PATHS = { stream: (s) => `/live/${encodeURIComponent(s)}`, listing: (s) => `/chadhava/listings/${encodeURIComponent(s)}`, pooja: (s) => `/poojas/${encodeURIComponent(s)}` };

  return {
    async exists(type, slug) {
      try {
        if (type === 'temple') return bySlug((await bundle()).temples, slug);
        if (type === 'aarti') return bySlug((await bundle()).aartis, slug);
        const path = PATHS[type];
        if (!path) throw new Error(`unknown catalog reference type ${type}`);
        await client.get(`${NS}${path(slug)}`);
        return true;
      } catch (e) {
        if (e instanceof ServiceError && e.status === 404) return false;
        if (e instanceof ServiceError || e?.name === 'AbortError') throw new CatalogUnavailable(e.code || e.message);
        throw e;
      }
    },
  };
}
