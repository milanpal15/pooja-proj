import { BUILTIN_ROLES, ROLE_PERMISSIONS } from '@bhakti/common';

import { Operator, Role } from '../models/index.js';

export const MAX_CUSTOM_ROLES = 40;
export const BUILTIN_KEYS = BUILTIN_ROLES.map((r) => r.key);
export const isBuiltin = (key) => BUILTIN_KEYS.includes(key);

const builtinOf = (b) => ({ key: b.key, name: b.name, description: b.description, builtin: true, permissions: [...ROLE_PERMISSIONS[b.key]], updatedAt: null, updatedBy: null });
const customOf = (r) => ({ key: r.key, name: r.name, description: r.description ?? '', builtin: false, permissions: [...(r.permissions ?? [])], updatedAt: r.updatedAt ?? null, updatedBy: r.updatedBy ?? null });

/** One role (built-in from code, custom from the collection), or null. */
export async function findRole(key) {
  const k = typeof key === 'string' ? key.trim().toLowerCase() : '';
  const b = BUILTIN_ROLES.find((x) => x.key === k);
  if (b) return builtinOf(b);
  if (!k) return null;
  const doc = await Role.findOne({ key: k }).lean();
  return doc ? customOf(doc) : null;
}

/**
 * The permission strings a role key resolves to - from the STORE, so an edit to a custom role applies on the next call.
 * An unknown key (a deleted role, a typo) holds nothing: fail closed.
 */
export async function permissionsOfRole(key) {
  return (await findRole(key))?.permissions ?? [];
}

/** Every role, built-ins first, with how many operators hold each. */
export async function listRoles() {
  const [customs, counts] = await Promise.all([Role.find().sort({ createdAt: 1, key: 1 }).lean(), Operator.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }])]);
  const byRole = new Map(counts.map((c) => [c._id, c.n]));
  return [...BUILTIN_ROLES.map(builtinOf), ...customs.map(customOf)].map((r) => ({ ...r, operatorCount: byRole.get(r.key) ?? 0 }));
}

/** key -> role, for naming operators in a list. */
export async function roleIndex() {
  return new Map((await listRoles()).map((r) => [r.key, r]));
}
