import { FORBIDDEN_TEXT } from '../access/forbidden.js';

/*
 * Where the API lives.
 *
 * Empty means same-origin, which is right in dev: Vite proxies /api and
 * /uploads to a local API, so the browser sees one origin.
 *
 * In production the dashboard is a static site and the API is a separate
 * service, so the build needs VITE_API_BASE. Without it the dashboard will
 * call itself and every request 404s — see pooja-admin/README.md.
 */
function normalise(raw) {
  // Empty stays empty: that is same-origin, which is what dev wants.
  if (!raw) return '';
  // Render's blueprint can only pass the API's HOST, with no scheme. Left
  // as-is that is a relative path, so every call would hit this site
  // instead of the API and 404 against the SPA fallback.
  const absolute = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  // `${BASE}/api` would otherwise become `//api` and lose the path.
  return absolute.replace(/\/+$/, '');
}

export const BASE = normalise(import.meta.env.VITE_API_BASE);

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
/** Tell the shell the session is gone (also used by the multipart upload, which bypasses `req`). */
export const notifyUnauthorized = () => onUnauthorized();
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

/** Notified on any 403 forbidden, so the app can toast and refetch the session. */
let onForbidden = () => {};
export const setForbiddenHandler = (fn) => {
  onForbidden = fn;
};

/** Build the error for a failed response; a 403 forbidden also fires the global handler. */
export async function failure(res) {
  // The API answers { error, code, needs } — surface its own sentence (and
  // code, so callers can switch on it) rather than a bare "400 Bad Request".
  const body = await res.json().catch(() => null);
  const forbidden = res.status === 403 && (!body?.code || body.code === 'forbidden');
  const err = Object.assign(new Error(forbidden ? FORBIDDEN_TEXT : body?.error || `${res.status} ${res.statusText}`), {
    status: res.status,
    code: body?.code,
    needs: body?.needs,
    forbidden,
    body,
  });
  if (forbidden) onForbidden(err);
  return err;
}

export async function req(path, options) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      // The admin session is an HttpOnly cookie; without this it is not sent
      // when the dashboard and API are on different origins.
      credentials: 'include',
      ...options,
    });
  } catch {
    // fetch only rejects when nothing answered: the API is down or unreachable.
    throw Object.assign(new Error("Can't reach the API"), { offline: true });
  }
  if (res.status === 401) {
    onUnauthorized();
    throw new Unauthorized();
  }
  if (!res.ok) throw await failure(res);
  return res.json();
}

/** `?a=1&b=2`, skipping blanks, so callers can pass optional filters freely. */
export function qs(params = {}) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const send = (method, body) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

/** `{ packs: [...] }` or a bare array — both come back as the array. */
export const rows = (res, key) => (Array.isArray(res) ? res : res?.[key] ?? []);

