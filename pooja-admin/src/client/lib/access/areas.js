/**
 * Every permission AREA the dashboard knows (DESIGN.md §21.3, docs/ROLES.md §1). Pure data, no React.
 * The Roles page draws its matrix from `GET /api/admin/roles` (`areas`) and uses this table only for areas
 * the server did not describe, and scripts/check-access.mjs uses it to prove every module names a real area.
 * `group` is a sidebar group key (lib/nav/registry.js).
 */
export const KNOWN_AREAS = [
  { key: 'overview', label: 'Overview & visitors', description: 'The dashboard home, charts and visitor counts.', group: 'insights' },
  { key: 'devotees', label: 'Devotees', description: 'Devotee accounts, including names and phone numbers.', group: 'people' },
  { key: 'announcements', label: 'Announcements', description: 'Messages shown to every devotee in the app.', group: 'people' },
  { key: 'push', label: 'Push notifications', description: 'Send a notification to every phone.', group: 'people' },
  { key: 'releases', label: 'App releases', description: 'Builds, the minimum/blocked version policy and maintenance mode.', group: 'releases' },
  { key: 'flags', label: 'Feature flags', description: 'Switch app features on and off.', group: 'releases' },
  { key: 'content', label: 'App content', description: 'Temples, deities, aartis, poojas, Home layout and the rest of what the app shows.', group: 'content' },
  { key: 'horoscope', label: 'Horoscope', description: 'Daily readings for the twelve signs.', group: 'content' },
  { key: 'panchang', label: 'Panchang', description: 'The daily almanac.', group: 'content' },
  { key: 'events', label: 'Events', description: 'Community events, tasks and badges.', group: 'content' },
  { key: 'orders', label: 'Bookings & reviews', description: 'Pooja and chadhava bookings, coin orders and reviews.', group: 'commerce' },
  { key: 'astrologers', label: 'Astrologers', description: 'Astrologer accounts and availability.', group: 'commerce' },
  { key: 'money', label: 'Coin packs & billing', description: 'Coin packs and per-minute billing rules.', group: 'commerce' },
  { key: 'wallets', label: 'Wallets', description: 'Wallet ledger and balance adjustments.', group: 'commerce' },
  { key: 'calls', label: 'Calls', description: 'Call log, live calls and refunds.', group: 'commerce' },
  { key: 'payouts', label: 'Payouts', description: 'Astrologer payouts.', group: 'commerce' },
  { key: 'policies', label: 'Rules & policies', description: 'Terms and rules devotees must accept.', group: 'admin' },
  { key: 'operators', label: 'Operators', description: 'Dashboard accounts.', group: 'admin' },
  { key: 'roles', label: 'Roles & permissions', description: 'Create roles and decide what each may see and edit.', group: 'admin' },
  { key: 'approvals', label: 'Approvals', description: 'Review and approve risky changes made by other operators.', group: 'admin' },
  { key: 'audit', label: 'Audit log', description: 'Who changed what, with before and after.', group: 'insights' },
];
export const KNOWN_AREA_KEYS = KNOWN_AREAS.map((a) => a.key);
