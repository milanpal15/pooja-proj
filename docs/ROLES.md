# Custom roles and per-area access — contract (pulled forward from `DASHBOARD_REVAMP.md` §5.8; built together with `docs/RELEASES.md`)

Today a dashboard login has one of three hard-coded roles (`admin` / `editor` / `viewer`, `DESIGN.md` §21) defined in code (`permissions.js`). This adds
**operator-defined roles**: an admin picks, per area, whether a role may *view* or *edit*, assigns roles to operators, and every screen/route follows
from that one list. The three built-ins stay as read-only presets.

## 1. Model (identity service, collection `roles`)
```
Role { key* (slug 3–30, unique, immutable), name* (≤ 40), description (≤ 160), builtin: bool, permissions: ["<area>:view"|"<area>:edit", …], createdBy, updatedBy, updatedAt }
```
* **Permissions** are the existing `"<area>:view|edit"` strings; `edit` implies `view`. **Areas** are listed once in `@bhakti/common` (`AREAS`): the current 17 plus **`releases`, `approvals`, `audit`, `roles`** (and later
  `notifications`, `segments`, `config`, `media`, `insights`). Each area has a `label`, a one-line `description` and a `group` (the sidebar group) for the matrix UI.
* **Built-ins** `admin`, `editor`, `viewer` are code-defined presets returned with `builtin:true`; they cannot be edited or deleted. Updated presets: `admin` = everything (incl. the new areas, `releases:edit`, `approvals:edit`, `audit:view`, `roles:edit`);
  `editor` = today's rights + `releases:view`, `approvals:view`; `viewer` = today's views + `releases:view`, `approvals:view`. `audit` and `roles` are admin-only (like `operators`, `devotees`, `push`).
* `Operator.role` becomes a role **key** (string). Existing operators keep `admin|editor|viewer`. An operator whose role no longer resolves has **no permissions** (fail closed).
* **Resolution:** identity resolves `role → permissions[]` from the store (built-ins from code, customs from the collection). The admin BFF caches the resolved list per role for ≤ 30 s, so an edit to a role applies to signed-in operators within ~30 s with no re-login;
  `GET /api/admin/session` returns `{ username, role, roleName, permissions }` from that resolution, and the BFF's route gate and the services' signed-permission re-check use the SAME resolved list. The dashboard derives everything (sidebar, ⌘K, buttons, read-only forms) from `permissions` — it never checks a role name
  (`scripts/check-access.mjs` still fails the build if a component does).

## 2. Admin API (admin BFF → identity; area `roles`: view = admin only by default, edit = admin only by default; audited with before/after)
* `GET /api/admin/roles` → `{ roles:[{ key, name, description, builtin, permissions, operatorCount }], areas:[{ key, label, description, group, levels:['view','edit'] }] }` (also available, read-only, to any operator that can `operators:view`, so the Operators screen can show role names — the permissions list is omitted for them).
* `POST /api/admin/roles` `{ key, name, description?, permissions }` → 201 · `PUT /api/admin/roles/:key` (custom only; `403 builtin`) · `DELETE /api/admin/roles/:key` (custom only; `409 in_use` with the operator count) · `POST /api/admin/roles/:key/duplicate` `{ key, name }`.
* Validation `400 bad_role { fields }`: unknown permission string, `edit` without implying view is normalised (store both), name/key rules, ≤ 40 custom roles.
* **Guards (server-side, tested):** (1) **no privilege escalation** — an operator may only grant permissions they hold themselves (`403 escalation` listing the offending ones); (2) a role can't be deleted while operators use it; (3) the system always keeps ≥ 1 active operator with the built-in `admin` role (existing lock-out rules remain); (4) you can't change your own role; (5) `roles:edit` can't be given to a role by someone without it.
* Operators: `POST/PUT /api/admin/operators` accept any existing role key (`400 unknown_role`); the operator list returns `roleName`. The old three-value enum is removed from the model.

## 3. Dashboard
* **Admin › Roles & permissions** page (area `roles`): list of roles (name, description, built-in lock, operator count, last edited) · role editor: name/description + the **permission matrix** (rows = areas grouped like the sidebar, columns **View / Edit**, edit ⇒ view, row and column presets, "Start from preset" Admin/Editor/Viewer, "Select all in group") · **"This role will see"** live preview listing the sidebar modules and notable abilities that the matrix grants · Duplicate · Delete (confirm; blocked with the operator count when in use) · built-ins are read-only with a lock and a "Duplicate to customise" action.
* **Operators**: the role select lists all roles with their description; shows role names; changing a role needs the existing confirm; clear errors for `escalation`, `unknown_role`.
* Every new module (Releases, Approvals, Audit, Roles) declares its area in the module registry; the sidebar and the ⌘K palette hide anything the session cannot view; pages are read-only without `edit` (existing "View only" pattern).
* A "Preview as role" aid is NOT required.

## 4. Tests that must exist
Permission resolution (built-in/custom/unknown ⇒ none, edit ⇒ view), escalation guard matrix, in-use delete, last-admin guard, own-role guard, BFF cache refresh within TTL (fake clock), route-gate table covers every new route (`access-parity` exemptions for areas that exist only in `backend/`), operator create/update with custom roles, audit before/after on role writes, dashboard matrix logic (normalisation, presets, preview list), check-access still passing with the new areas.

## 5. Backend as built (binding)
* `AREAS` stays the list of keys; `AREA_INFO` is the registry with `label`, `description`, `group` (`Overview`, `People`, `Releases & control`, `Content`, `Commerce`, `Insights`, `Admin`). `GET /api/admin/roles` returns `areas` from it and each role with `updatedAt`/`updatedBy` (null for built-ins).
* Errors (all `{ error, code, … }`): `400 bad_role { fields:{ key|name|description|permissions: message } }`, `403 escalation { permissions:[offending] }` (also when assigning a role to an operator, or touching an operator who outranks you), `403 builtin`, `409 in_use { operators, operatorCount }`, `409 key_taken`, `400 unknown_role`, `400 own_role` (you cannot change your own role), `404 not_found`. A role key is 3–30 chars `[a-z0-9-]`, starting with a letter; `admin|editor|viewer` are reserved.
* Editing a role only checks **newly granted** permissions against the caller (renaming it or removing rights never needs them). Duplicating requires holding everything the source holds.
* `GET /api/admin/roles` is also allowed with `operators:view` (the route table's `viewAlso`); those callers get no `permissions`. Creating/duplicating is `roles:edit`.
* The BFF's role → permission cache is the per-operator session cache (5 s TTL, ≤ the 30 s ceiling), dropped immediately by any operator/role write that passes through that BFF instance; the gate and the signed `perms` use the same list.
* Operators list/PUT/POST answers carry `roleName`. An operator whose role no longer exists stays signed in with no permissions.
* Boot migration (idempotent): operators with no role become `editor`; stray case/whitespace in a role key is normalised. Custom roles need no migration.
