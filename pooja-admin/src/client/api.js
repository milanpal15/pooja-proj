/*
 * Same-origin by default.
 *
 * The API serves this bundle in production and Vite proxies /api to it in
 * dev, so an empty base is correct in both — requests go to whatever host
 * the dashboard was loaded from. VITE_API_BASE remains only for the odd case
 * of pointing a local dashboard at a remote API.
 */
const BASE = import.meta.env.VITE_API_BASE || '';

async function req(path, options) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
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

  users: {
    list: () => req('/users'),
    update: (id, body) => req(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id) => req(`/users/${id}`, { method: 'DELETE' }),
  },

  // Upload an image/audio file, returns { url }.
  async upload(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE}/api/content/upload`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error('upload failed');
    return res.json();
  },
};
