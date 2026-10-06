/*
 * Same-origin by default.
 *
 * The API serves this bundle in production and Vite proxies /api to it in
 * dev, so an empty base is correct in both — requests go to whatever host
 * the dashboard was loaded from. VITE_API_BASE remains only for the odd case
 * of pointing a local dashboard at a remote API.
 */
const BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Raised when the server says the admin session is missing or expired.
 *
 * A distinct type so the shell can swap in the login screen instead of
 * rendering "Can't reach API" over what is really just a timed-out session.
 */
export class Unauthorized extends Error {
  constructor() {
    super('Admin sign-in required');
    this.name = 'Unauthorized';
  }
}

/** Notified on any 401, so the app can show the login screen immediately. */
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function req(path, options) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    // The admin session is an HttpOnly cookie; without this it is not sent
    // when the dashboard and API are on different origins.
    credentials: 'include',
    ...options,
  });
  if (res.status === 401) {
    onUnauthorized();
    throw new Unauthorized();
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
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

  // Resolve a stored asset path (host-relative like `/uploads/x.png`, or an
  // older absolute URL) into a loadable URL for the dashboard.
  asset: (url) => (!url ? '' : /^https?:\/\//.test(url) ? url : `${BASE}${url}`),
  summary: () => req('/analytics/summary'),
  trend: () => req('/analytics/trend'),
  flags: () => req('/flags/full'),
  setFlag: (key, enabled) =>
    req(`/flags/${key}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  payments: () => req('/payments'),
  visitors: () => req('/visitors'),

  deities: resource('deities'),
  announcements: resource('announcements'),

  // Rules & regulations. `publish` bumps the version, which invalidates every
  // prior acceptance and makes the app ask again.
  policy: (key) => req(`/policy/${key}`),
  policies: () => req('/admin/policies'),
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
  hero: resource('hero'),
  settings: resource('settings'),
  horoscopes: resource('horoscopes'),
  panchangs: resource('panchangs'),

  /** A whole day's readings, read and written in one call. */
  horoscopeDay: (date) => req(`/horoscope/day/${date}`),
  saveHoroscopeDay: (date, readings) =>
    req(`/horoscope/day/${date}`, { method: 'PUT', body: JSON.stringify({ readings }) }),

  users: {
    list: () => req('/users'),
    update: (id, body) => req(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id) => req(`/users/${id}`, { method: 'DELETE' }),
  },

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
      onUnauthorized();
      throw new Unauthorized();
    }
    if (!res.ok) throw new Error('upload failed');
    return res.json();
  },
};
