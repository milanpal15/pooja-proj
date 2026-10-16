import { createServiceClient } from '@bhakti/common';

/**
 * Identity's read-only windows onto the other services, for the Users 360 view and the list's version column (docs/USERS.md section 2).
 * Every one is a by-uid read on a route that answers to `iss: identity` ONLY:
 *
 *   engagement  POST /internal/engagement/devices/by-uids   GET /internal/engagement/devices/uids?versionCode=     (the device registry)
 *   wallet      GET  /internal/wallet/directory/users/:uid                    { balance, recent[] }
 *   orders      GET  /internal/orders/directory/users/:uid                    { total, recent[] }
 *   events      GET  /internal/events/directory/users/:uid                    { registrations[], badges[] }
 *   calls       GET  /internal/calls/directory/users/:uid/calls               { total, recent[] }
 *
 * A service whose URL is not configured throws `{ code:'not_configured' }` - the caller turns that (and any failure or timeout) into
 * `{ unavailable:true, reason }` for that one section; nothing here ever blocks a whole page.
 */
const notConfigured = (name) => Object.assign(new Error(`${name} is not configured`), { code: 'not_configured' });

export function createUserSources(config, { fetchImpl } = {}) {
  const mk = (service, baseUrl) =>
    baseUrl
      ? createServiceClient({ service, baseUrl, iss: 'identity', secret: config.secret, timeoutMs: config.sectionTimeoutMs ?? 1500, ...(fetchImpl ? { fetchImpl } : {}) })
      : null;
  const clients = {
    engagement: mk('engagement', config.engagementUrl),
    wallet: mk('wallet', config.walletUrl),
    orders: mk('orders', config.ordersUrl),
    events: mk('events', config.eventsUrl),
    calls: mk('calls', config.callsUrl),
  };
  const need = (name) => clients[name] ?? (() => { throw notConfigured(name); })();
  const enc = encodeURIComponent;

  return {
    configured: (name) => !!clients[name],
    /** All devices for these accounts: `[{ uid, deviceId, platform, versionName, versionCode, osApi, model, firstSeen, lastSeen }]` (one batched call, <= 1000 uids). */
    async devicesByUids(uids, reqId) {
      if (!uids.length) return [];
      const out = await need('engagement').post('/internal/engagement/devices/by-uids', { uids }, { reqId, timeoutMs: 3000 });
      return Array.isArray(out?.devices) ? out.devices : [];
    },
    /** Accounts seen on one build: `{ uids, truncated }`. */
    async uidsOnVersion(versionCode, reqId) {
      const out = await need('engagement').get('/internal/engagement/devices/uids', { query: { versionCode: String(versionCode), limit: '5000' }, reqId, timeoutMs: 3000 });
      return { uids: Array.isArray(out?.uids) ? out.uids : [], truncated: out?.truncated === true };
    },
    wallet: (uid, reqId) => need('wallet').get(`/internal/wallet/directory/users/${enc(uid)}`, { reqId }),
    orders: (uid, reqId) => need('orders').get(`/internal/orders/directory/users/${enc(uid)}`, { reqId }),
    events: (uid, reqId) => need('events').get(`/internal/events/directory/users/${enc(uid)}`, { reqId }),
    calls: (uid, reqId) => need('calls').get(`/internal/calls/directory/users/${enc(uid)}/calls`, { reqId }),
  };
}
