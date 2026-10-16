import { makeAccess, tabReadOnly, tabVisible } from '../../../lib/access/permissions.js';
import { GROUPS } from '../../../lib/nav/registry.js';

/** What a role with `perms` would see in the sidebar, built from the module registry: groups -> modules, each read-only or editable. */
export function previewModules(perms, modules) {
  const access = makeAccess({ permissions: perms });
  const visible = modules.filter((m) => tabVisible(m, access));
  const toItem = (m) => ({ id: m.id, title: m.title, mode: tabReadOnly(m, access) ? 'view' : 'edit' });
  const sections = [];
  const top = visible.filter((m) => !m.group);
  if (top.length) sections.push({ key: 'top', label: '', items: top.map(toItem) });
  for (const g of GROUPS) {
    const items = visible.filter((m) => m.group === g.key).map(toItem);
    if (items.length) sections.push({ key: g.key, label: g.label, items });
  }
  return { sections, count: visible.length };
}

/** Plain-language abilities that deserve a mention. Order is the order shown. */
const NOTABLE = [
  ['roles:edit', 'Create roles and decide what each may see and edit'],
  ['operators:edit', 'Add, disable and delete dashboard operators'],
  ['approvals:edit', 'Approve or reject other operators’ risky changes'],
  ['releases:edit', 'Change the version policy and maintenance mode (risky changes may need approval)'],
  ['push:edit', 'Send a notification to every phone'],
  ['money:edit', 'Change coin packs and billing rules'],
  ['wallets:edit', 'Adjust devotee wallets'],
  ['payouts:edit', 'Mark astrologer payouts paid'],
  ['calls:edit', 'End calls and issue refunds'],
  ['devotees:edit', 'Block and delete devotees'],
  ['devotees:view', 'See devotee names and phone numbers (unmasked)'],
  ['flags:edit', 'Switch app features on and off'],
  ['content:edit', 'Edit app content, including the Home layout'],
  ['audit:view', 'Read the audit log'],
];

export function notableAbilities(perms) {
  const access = makeAccess({ permissions: perms });
  const out = NOTABLE.filter(([p]) => access.can(p)).map(([, text]) => text);
  // `devotees:view` is implied by edit; say it once.
  return access.can('devotees:edit') ? out.filter((t) => !t.startsWith('See devotee names')).concat('See devotee names and phone numbers (unmasked)') : out;
}
