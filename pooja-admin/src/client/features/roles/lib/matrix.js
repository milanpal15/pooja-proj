import { GROUPS } from '../../../lib/nav/registry.js';

/**
 * The permission matrix's logic (docs/ROLES.md §3), pure. A role's permissions are "<area>:view" / "<area>:edit" strings;
 * `edit` implies `view`, so a row has exactly three states: none, view, edit. The server normalises the same way
 * (stores both), so what this builds is what it saves.
 */

export const levelOf = (perms, area) => (perms.includes(`${area}:edit`) ? 'edit' : perms.includes(`${area}:view`) ? 'view' : 'none');

/** Dedupe, drop strings that are not "<known area>:view|edit", add the view that an edit implies, order by `areaKeys`. */
export function normalize(perms, areaKeys) {
  const held = new Set();
  for (const p of Array.isArray(perms) ? perms : []) {
    const [area, level] = String(p).split(':');
    if (!areaKeys.includes(area) || (level !== 'view' && level !== 'edit')) continue;
    held.add(`${area}:view`);
    if (level === 'edit') held.add(`${area}:edit`);
  }
  return areaKeys.flatMap((a) => [`${a}:view`, `${a}:edit`].filter((p) => held.has(p)));
}

/** One area to a state. */
export function setLevel(perms, area, level, areaKeys) {
  const rest = perms.filter((p) => !p.startsWith(`${area}:`));
  const add = level === 'edit' ? [`${area}:view`, `${area}:edit`] : level === 'view' ? [`${area}:view`] : [];
  return normalize([...rest, ...add], areaKeys);
}

/** Tick / untick one checkbox: Edit on => view too; View off => edit off too; Edit off keeps view. */
export function toggle(perms, area, column, on, areaKeys) {
  if (column === 'edit') return setLevel(perms, area, on ? 'edit' : 'view', areaKeys);
  return setLevel(perms, area, on ? (levelOf(perms, area) === 'edit' ? 'edit' : 'view') : 'none', areaKeys);
}

/** Set one column for several areas at once ("select all in group"). Areas in `skip` (not grantable) are left as they are. */
export function setColumn(perms, areas, column, on, areaKeys, skip = () => false) {
  return areas.reduce((p, a) => (skip(a, column) ? p : toggle(p, a, column, on, areaKeys)), perms);
}

/** 'all' | 'some' | 'none' for a column over `areas`. */
export function columnState(perms, areas, column) {
  const n = areas.filter((a) => (column === 'edit' ? levelOf(perms, a) === 'edit' : levelOf(perms, a) !== 'none')).length;
  return n === 0 ? 'none' : n === areas.length ? 'all' : 'some';
}

/** Areas bucketed by their sidebar group, in sidebar order. `group` may be a key ('people') or a label ('People'). */
export function groupAreas(areas) {
  const order = GROUPS.map((g) => ({ key: g.key, label: g.label }));
  const norm = (s) => String(s || '').toLowerCase();
  const out = new Map();
  const slot = (label) => {
    if (!out.has(label)) out.set(label, []);
    return out.get(label);
  };
  for (const a of areas) {
    const hit = order.find((g) => norm(g.key) === norm(a.group) || norm(g.label) === norm(a.group));
    slot(hit ? hit.label : a.group === 'Overview' || norm(a.group) === 'overview' ? 'Overview' : a.group || 'Other').push(a);
  }
  const known = ['Overview', ...order.map((g) => g.label)];
  return [...out.entries()].sort((a, b) => (known.indexOf(a[0]) + 99) % 99 - (known.indexOf(b[0]) + 99) % 99).map(([label, items]) => ({ label, areas: items }));
}

/** The built-in presets as returned by the roles list. */
export function presets(roles) {
  return roles.filter((r) => r.builtin && Array.isArray(r.permissions));
}

export function diffPerms(before, after) {
  const a = new Set(before);
  const b = new Set(after);
  return { added: [...b].filter((p) => !a.has(p)), removed: [...a].filter((p) => !b.has(p)) };
}

export const samePerms = (a, b) => {
  const d = diffPerms(a, b);
  return d.added.length === 0 && d.removed.length === 0;
};

const KEY_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;
export const slugify = (name) => String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

/** Mirrors the server's `bad_role` rules: key 3-30 slug, name <= 40, description <= 160, a free key. */
export function validateRole(r, { isNew, takenKeys = [] } = {}) {
  const e = {};
  if (isNew) {
    if (!KEY_RE.test(r.key)) e.key = 'Use 3 to 30 characters: lowercase letters, digits, - or _.';
    else if (takenKeys.includes(r.key)) e.key = 'A role with this key already exists.';
  }
  if (!r.name.trim()) e.name = 'Give the role a name.';
  else if (r.name.trim().length > 40) e.name = 'At most 40 characters.';
  if (r.description.length > 160) e.description = `At most 160 characters (${r.description.length}).`;
  return e;
}

/** The permissions the server named in an `escalation` refusal. */
export function escalationList(err) {
  const b = err?.body || {};
  const list = b.permissions || b.offending || b.needs || err?.needs || [];
  return Array.isArray(list) ? list : [];
}
