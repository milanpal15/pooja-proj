/** A row's id: the API sends `id`, Mongo documents carry `_id`. */
export const idOf = (row) => row?.id ?? row?._id;

/** Initials for an avatar: "Pt. Rajesh Sharma" -> "RS" (titles skipped). */
export function initials(name = '') {
  const parts = String(name)
    .replace(/\b(pt|acharya|dr|shri|smt)\.?\s/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** A person as the admin lists show them: a string, or { name, contact }. */
export function whoLabel(who) {
  if (!who) return '—';
  if (typeof who === 'string') return who;
  return who.name || who.contact || who.uid || '—';
}
