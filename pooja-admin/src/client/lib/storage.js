/** localStorage / sessionStorage that never throws (private windows, blocked storage): reads fall back, writes are ignored. */
const pick = (kind) => {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

export function readJson(key, fallback, kind = 'local') {
  try {
    const raw = pick(kind)?.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value, kind = 'local') {
  try {
    pick(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage is a convenience, never required */
  }
}

export function removeKey(key, kind = 'local') {
  try {
    pick(kind)?.removeItem(key);
  } catch {
    /* ignore */
  }
}
