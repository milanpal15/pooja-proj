#!/usr/bin/env node
/**
 * Permission-matrix check for the dashboard (DESIGN.md §21.3, §21.6, §21.7).
 * Plain Node, no dependencies. It builds synthetic permission sets for the
 * three roles from the §21.3 table (the real ones live in the API), runs the
 * tab registry's metadata and the pure access helpers over them, and asserts
 * which tabs are visible and which are read-only. It also scans the UI for the
 * one thing §21.6 forbids: a component comparing a role name.
 *
 * Run by `npm run build`; `npm run check:access` runs it alone.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TAB_AREAS } from '../src/client/app/tab-areas.js';
import { KNOWN_AREA_KEYS } from '../src/client/lib/access/areas.js';
import { MODULES, GROUPS } from '../src/client/lib/nav/registry.js';
import { resolveRoute } from '../src/client/lib/nav/route.js';
import { makeAccess, tabReadOnly, tabVisible, visibleTabs } from '../src/client/lib/access/permissions.js';

// Every area (docs/ROLES.md §1): the monolith's 17 plus the governance areas that live only in backend/.
const AREAS = KNOWN_AREA_KEYS;
const ADMIN_ONLY = ['push', 'devotees', 'operators', 'audit', 'roles'];
const ABSENT = { editor: ADMIN_ONLY, viewer: ADMIN_ONLY };

// §21.3, transcribed. "edit" lists what the role may change; everything else it can see is view-only.
const perms = (view, edit) => [...edit.map((a) => `${a}:edit`), ...view.filter((a) => !edit.includes(a)).map((a) => `${a}:view`)];
const ROLES = {
  admin: perms(AREAS, AREAS),
  editor: perms(AREAS.filter((a) => !ABSENT.editor.includes(a)), ['content', 'horoscope', 'panchang', 'announcements', 'events']),
  viewer: perms(AREAS.filter((a) => !ABSENT.viewer.includes(a)), []),
};
const session = (role) => ({ required: true, authed: true, username: role, role, permissions: ROLES[role] });

const ALL = TAB_AREAS.map((t) => t.id);
const byIdEarly = Object.fromEntries(TAB_AREAS.map((t) => [t.id, t]));
const CONTENT_EDITABLE = ['Announcements', 'Deities', 'Temples', 'Aartis', 'Festivals', 'Sevas', 'Offerings', 'Knowledge', 'FAQs', 'Home layout', 'Poojas', 'Chadhava', 'Home slider', 'Live darshan', 'Events', 'Horoscope', 'Panchang', 'Reminders', 'Alert Tones', 'Wallpapers', 'Settings'];
const HIDDEN_FROM_NON_ADMIN = ['Users', 'Operators', 'Audit log', 'Roles & permissions'];
const EXPECT = {
  // Admin sees and edits everything (orders:edit = move a booking on, hide a review).
  admin: { visible: ALL, readOnly: [] },
  editor: { visible: ALL.filter((t) => !HIDDEN_FROM_NON_ADMIN.includes(t)), editable: CONTENT_EDITABLE },
  viewer: { visible: ALL.filter((t) => !HIDDEN_FROM_NON_ADMIN.includes(t)), editable: [] },
};
EXPECT.editor.readOnly = EXPECT.editor.visible.filter((t) => !CONTENT_EDITABLE.includes(t));
EXPECT.viewer.readOnly = EXPECT.viewer.visible;

let checks = 0;
const ok = (fn) => {
  fn();
  checks += 1;
};

// 1. The matrix: sidebar and read-only mode per role.
for (const role of Object.keys(ROLES)) {
  const access = makeAccess(session(role));
  const visible = visibleTabs(TAB_AREAS, access).map((t) => t.id);
  ok(() => assert.deepEqual(visible, EXPECT[role].visible, `${role}: visible tabs`));
  const readOnly = visibleTabs(TAB_AREAS, access).filter((t) => tabReadOnly(t, access)).map((t) => t.id);
  ok(() => assert.deepEqual(readOnly, EXPECT[role].readOnly, `${role}: read-only tabs`));
}

// 2. Section gating inside the combined tabs.
const section = (role, area, level) => makeAccess(session(role))[level === 'edit' ? 'canEdit' : 'canView'](area);
ok(() => assert.equal(section('admin', 'wallets', 'edit'), true, 'admin may adjust wallets'));
ok(() => assert.equal(section('editor', 'wallets', 'view'), true));
ok(() => assert.equal(section('editor', 'wallets', 'edit'), false, 'editor: no "Adjust a wallet"'));
ok(() => assert.equal(section('editor', 'money', 'edit'), false, 'editor: packs and billing rules read-only'));
ok(() => assert.equal(section('editor', 'payouts', 'edit'), false, 'editor: no Mark paid'));
ok(() => assert.equal(section('editor', 'calls', 'edit'), false, 'editor: no End call / refund'));
ok(() => assert.equal(section('editor', 'push', 'view'), false, 'editor: no push'));
ok(() => assert.equal(section('editor', 'orders', 'view'), true, 'editor reads bookings and reviews'));
ok(() => assert.equal(section('editor', 'orders', 'edit'), false, 'editor: no "Mark performed" / "Hide review"'));
ok(() => assert.equal(section('viewer', 'orders', 'edit'), false, 'viewer: bookings read-only'));
ok(() => assert.equal(section('admin', 'orders', 'edit'), true, 'admin moves bookings on and hides reviews'));
ok(() => assert.deepEqual(['Home layout', 'Home slider', 'Poojas', 'Chadhava'].map((id) => byIdEarly[id].area), ['content', 'content', 'content', 'content'], 'content tabs'));
ok(() => assert.equal(byIdEarly.Bookings.area, 'orders', 'Bookings is the orders area'));
ok(() => assert.equal(section('editor', 'announcements', 'edit'), true));
ok(() => assert.equal(section('viewer', 'content', 'edit'), false));

// 3. Rules of the helpers.
ok(() => assert.equal(makeAccess({ permissions: ['content:edit'] }).canView('content'), true, 'edit implies view'));
ok(() => assert.equal(makeAccess({ permissions: ['content:view'] }).canEdit('content'), false, 'view does not imply edit'));
ok(() => assert.equal(makeAccess(null).canView('overview'), false, 'no session: nothing'));
ok(() => assert.equal(makeAccess({ role: 'admin' }).canView('overview'), false, 'no permissions: nothing, whatever the role says'));
ok(() => assert.equal(makeAccess({ permissions: 'content:edit' }).can('content:edit'), false, 'malformed list: nothing'));
ok(() => assert.equal(makeAccess({ permissions: ['content:edit'] }).can(undefined), false));
const dev = makeAccess({ required: false, authed: false });
ok(() => assert.deepEqual(visibleTabs(TAB_AREAS, dev).map((t) => t.id), ALL, 'dev with no operators: everything'));
ok(() => assert.equal(dev.canEdit('operators'), true));
ok(() => assert.equal(tabVisible({ id: 'X' }, makeAccess({ permissions: AREAS.map((a) => `${a}:edit`) })), false, 'a tab with no area is hidden'));
const walletsOnly = makeAccess({ permissions: ['wallets:view'] });
const byId = Object.fromEntries(TAB_AREAS.map((t) => [t.id, t]));
ok(() => assert.equal(tabVisible(byId['Coins & Wallets'], walletsOnly), true, 'a combined tab shows when one section is viewable'));
ok(() => assert.equal(tabVisible(byId['Calls & Payouts'], walletsOnly), false));
ok(() => assert.ok(TAB_AREAS.every((t) => [].concat(t.area).every((a) => AREAS.includes(a))), 'every tab names a known area'));
ok(() => assert.equal(new Set(ALL).size, ALL.length, 'tab ids are unique (they are the #hash)'));

// 3b. The module registry (docs/DASHBOARD_REVAMP.md §4): every module has a known area, a real group, a unique route,
//     and its old #Tab hash still resolves to it. Editors and viewers see Releases and Approvals but may not edit them.
ok(() => assert.equal(MODULES, TAB_AREAS, 'tab-areas.js re-exports the registry'));
ok(() => assert.ok(MODULES.every((m) => [].concat(m.area).every((a) => KNOWN_AREA_KEYS.includes(a))), 'every module names a known area'));
ok(() => assert.ok(MODULES.every((m) => !m.group || GROUPS.some((g) => g.key === m.group)), 'every module is in a known group'));
ok(() => assert.equal(new Set(MODULES.map((m) => m.route)).size, MODULES.length, 'module routes are unique'));
ok(() => assert.ok(MODULES.every((m) => resolveRoute('#' + encodeURIComponent(m.id), MODULES, GROUPS).module?.id === m.id), 'every old #Tab link resolves'));
ok(() => assert.ok(MODULES.every((m) => resolveRoute('#' + m.route, MODULES, GROUPS).module?.id === m.id), 'every canonical route resolves'));
ok(() => assert.deepEqual(['App releases', 'Approvals', 'Audit log', 'Roles & permissions'].map((id) => byIdEarly[id].area), ['releases', 'approvals', 'audit', 'roles']));
ok(() => assert.equal(section('editor', 'releases', 'view'), true));
ok(() => assert.equal(section('editor', 'releases', 'edit'), false, 'editor: no policy edits'));
ok(() => assert.equal(section('viewer', 'approvals', 'edit'), false));
ok(() => assert.equal(section('editor', 'audit', 'view'), false, 'audit is admin-only'));
ok(() => assert.equal(section('editor', 'roles', 'view'), false, 'roles is admin-only'));
ok(() => assert.equal(section('admin', 'roles', 'edit'), true));

// 4. No component compares a role name (§21.6). The Operators screen's picker
//    lists roles as data and never branches on one.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/client');
const offenders = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) {
      fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (/\brole\s*[!=]==?\s*['"`]|['"`]\s*[!=]==?\s*[\w.?]*\brole\b|isAdmin|adminOnly/.test(line)) offenders.push(`${path.relative(root, p)}:${i + 1}  ${line.trim()}`);
      });
    }
  }
})(root);
ok(() => assert.deepEqual(offenders, [], `role comparisons found:\n${offenders.join('\n')}`));

// 5. The kit is the only look (DESIGN.md §10): no screen reaches for the retired
//    `.btn` / `.link-btn` / `.modal` / `.pill` / `.toggle` / `.panel` markup.
const legacy = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx$/.test(e.name)) {
      fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (/className=["'`{][^"'`]*\b(btn|link-btn|modal|modal-backdrop|pill|toggle|panel|slider)\b/.test(line)) legacy.push(`${path.relative(root, p)}:${i + 1}  ${line.trim()}`);
      });
    }
  }
})(root);
ok(() => assert.deepEqual(legacy, [], `legacy markup found (use the kit):\n${legacy.join('\n')}`));

console.log(`check-access: ok (${checks} checks; ${Object.keys(ROLES).length} roles x ${TAB_AREAS.length} tabs)`);
