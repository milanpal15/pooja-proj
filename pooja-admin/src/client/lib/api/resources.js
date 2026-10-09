import { BASE, Unauthorized, failure, notifyUnauthorized, qs, req, rows, send } from './client.js';

/** CRUD over an admin-only collection that lives under /admin/<name>. */
function adminResource(name, key = name) {
  return {
    list: async () => rows(await req(`/admin/${name}`), key),
    create: (body) => req(`/admin/${name}`, send('POST', body)),
    update: (id, body) => req(`/admin/${name}/${id}`, send('PUT', body)),
    remove: (id) => req(`/admin/${name}/${id}`, send('DELETE')),
  };
}

/** Generic CRUD helpers for a content resource (deities/temples/aartis). */
function resource(name) {
  return {
    list: () => req(`/content/${name}`),
    create: (body) => req(`/content/${name}`, { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) =>
      req(`/content/${name}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id) => req(`/content/${name}/${id}`, { method: 'DELETE' }),
  };
}

export const api = {
  base: BASE,

  /* ------------------------------------------------------------ session -- */
  session: () => req('/admin/session'),
  login: (username, password) =>
    req('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  /* ---------------------------------------------------------- operators -- */
  operators: {
    list: () => req('/admin/operators'),
    create: (body) => req('/admin/operators', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => req(`/admin/operators/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id) => req(`/admin/operators/${id}`, { method: 'DELETE' }),
  },
  logout: () => req('/admin/logout', { method: 'POST' }),
  /** Newest first. Admin only (area `operators`). */
  auditLog: async (limit = 100) => rows(await req(`/admin/audit-log${qs({ limit })}`), 'entries'),

  // Resolve a stored asset path (host-relative like `/uploads/x.png`, or an
  // older absolute URL) into a loadable URL for the dashboard.
  asset: (url) => (!url ? '' : /^https?:\/\//.test(url) ? url : `${BASE}${url}`),
  summary: () => req('/analytics/summary'),
  trend: () => req('/analytics/trend'),
  flags: () => req('/flags/full'),
  setFlag: (key, enabled) =>
    req(`/flags/${key}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  visitors: () => req('/visitors'),

  deities: resource('deities'),
  announcements: resource('announcements'),

  // Rules & regulations. `publish` bumps the version, which invalidates every
  // prior acceptance and makes the app ask again.
  policy: (key) => req(`/policy/${key}`),
  savePolicy: (key, body, publish) =>
    req(`/admin/policies/${key}${publish ? '?publish=1' : ''}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  pushAnnouncement: (id) => req(`/admin/announcements/${id}/push`, { method: 'POST' }),

  temples: resource('temples'),
  aartis: resource('aartis'),
  festivals: resource('festivals'),
  sevas: resource('sevas'),
  knowledge: resource('knowledge'),
  faqs: resource('faqs'),
  hero: {
    ...resource('hero'),
    /** Rewrites `order` (10, 20, 30…) to follow `ids` (area content). */
    reorder: (ids) => req('/content/hero/order', send('PUT', { ids })),
  },
  settings: resource('settings'),
  horoscopes: resource('horoscopes'),
  panchangs: resource('panchangs'),
  reminders: resource('reminders'),
  tones: resource('tones'),
  wallpaperStyles: resource('wallpaper-styles'),

  /** A whole day's readings, read and written in one call. */
  horoscopeDay: (date) => req(`/horoscope/day/${date}`),
  saveHoroscopeDay: (date, readings) =>
    req(`/horoscope/day/${date}`, { method: 'PUT', body: JSON.stringify({ readings }) }),

  users: {
    list: () => req('/users'),
    update: (id, body) => req(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id) => req(`/users/${id}`, { method: 'DELETE' }),
  },

  /* ------------------------------------------- coins, astrologers, calls -- */
  // Contract: docs/COINS_AND_ASTROLOGERS.md. Money is paise on the wire
  // (…Paise fields); coins are integers; pack prices are whole rupees.
  coinPacks: adminResource('coin-packs', 'packs'),
  coinOrders: async (limit = 500) => rows(await req(`/admin/coin-orders${qs({ limit })}`), 'orders'),
  coinStats: (days = 30) => req(`/admin/coin-stats${qs({ days })}`),

  wallets: async (q) => rows(await req(`/admin/wallets${qs({ q })}`), 'wallets'),
  walletTransactions: async (params) =>
    rows(await req(`/admin/wallet-transactions${qs(params)}`), 'transactions'),
  adjustWallet: (body) => req('/admin/wallet/adjust', send('POST', body)),

  astrologers: {
    ...adminResource('astrologers'),
    suspend: (id) => req(`/admin/astrologers/${id}/suspend`, send('POST')),
    reactivate: (id) => req(`/admin/astrologers/${id}/reactivate`, send('POST')),
  },

  /** `{ calls, live }` — both CallRow lists. */
  calls: async (params) => {
    const r = await req(`/admin/calls${qs(params)}`);
    return { calls: r?.calls ?? [], live: r?.live ?? [] };
  },
  endCall: (id) => req(`/admin/calls/${id}/end`, send('POST')),
  refundCall: (id, body) => req(`/admin/calls/${id}/refund`, send('POST', body)),

  payoutSummary: async () => rows(await req('/admin/payouts/summary'), 'astrologers'),
  payouts: {
    list: async (astrologerId) => rows(await req(`/admin/payouts${qs({ astrologerId })}`), 'payouts'),
    create: (body) => req('/admin/payouts', send('POST', body)),
  },
  billingRules: {
    get: () => req('/admin/billing/rules'),
    save: (body) => req('/admin/billing/rules', send('PUT', body)),
  },

  /* ------------------------------ poojas, chadhava, home (POOJA_AND_HOME.md) -- */
  /** Pooja bookings. `params`: { status, q, limit }. Devotee arrives already masked. */
  bookings: async (params = { limit: 200 }) => rows(await req(`/admin/bookings${qs(params)}`), 'bookings'),
  /** Forward-only: booked -> sankalp -> performed (orders:edit). */
  setBookingStatus: (id, status) => req(`/admin/bookings/${id}/status`, send('PUT', { status })),
  chadhavaOrders: async (params = { limit: 200 }) => rows(await req(`/admin/chadhava-orders${qs(params)}`), 'orders'),
  /** booked -> offered (orders:edit). */
  setChadhavaOrderStatus: (id, status) => req(`/admin/chadhava-orders/${id}/status`, send('PUT', { status })),
  /** Reviews can be hidden or shown, and their text edited (orders:edit). */
  reviews: async (params) => rows(await req(`/admin/reviews${qs(params)}`), 'reviews'),
  setReviewHidden: (id, hidden) => req(`/admin/reviews/${id}`, send('PUT', { hidden })),
  /** Rewrite a review's text; the rating and the name are not editable. */
  setReviewText: (id, text) => req(`/admin/reviews/${id}`, send('PUT', { text })),

  poojas: {
    ...adminResource('poojas'),
    /** The full document (the list may carry less). Tolerates `{ pooja }` or a bare document. */
    get: async (id) => {
      const r = await req(`/admin/poojas/${id}`);
      return r?.pooja ?? r;
    },
    importSevas: () => req('/admin/poojas/import-sevas', send('POST')),
  },
  chadhavaListings: adminResource('chadhava-listings', 'listings'),
  chadhavaCategories: adminResource('chadhava-categories', 'categories'),

  homeSections: {
    ...adminResource('home-sections', 'sections'),
    /** Rewrites `order` (10, 20, 30…) to follow `ids`. */
    reorder: (ids) => req('/admin/home-sections/order', send('PUT', { ids })),
  },

  /** Live darshan (docs/LIVE_DARSHAN.md). Area content. */
  liveStreams: {
    ...adminResource('live-streams', 'streams'),
    /** Rewrites `order` to follow `ids`. */
    reorder: (ids) => req('/admin/live-streams/order', send('PUT', { ids })),
    /** "Test link": { sourceType, url } -> { ok, broadcasting: true|false|null, viewers, message }. */
    check: (body) => req('/admin/live-streams/check', send('POST', body)),
  },
  liveCategories: adminResource('live-categories', 'categories'),

  /** Chadhava offering catalogue — editors may manage it. */
  offerings: adminResource('offerings', 'offerings'),

  // Upload an image/audio file, returns { url }.
  async upload(file) {
    const fd = new FormData();
    fd.append('file', file);
    // Not through `req`: multipart must not carry a JSON Content-Type, so
    // this sets none and lets the browser write the boundary. It still needs
    // the session cookie and the same 401 handling.
    const res = await fetch(`${BASE}/api/content/upload`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    if (res.status === 401) {
      notifyUnauthorized();
      throw new Unauthorized();
    }
    if (!res.ok) throw await failure(res);
    return res.json();
  },
};
