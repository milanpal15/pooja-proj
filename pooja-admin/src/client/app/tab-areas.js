/**
 * The tab registry's metadata: order, grouping and — the part that matters
 * for access — the AREA each tab belongs to (DESIGN.md §21.3). Kept free of
 * React so scripts/check-access.mjs can import it in plain Node; tabs.js adds
 * each tab's page component.
 *
 *   id     the tab's name — its sidebar label, its heading and its #hash
 *   group  sidebar section heading; consecutive tabs with one group share a header
 *   area   what the tab belongs to. The sidebar shows it when the session can
 *          `<area>:view`; the page is read-only without `<area>:edit`.
 *          A tab that combines areas lists them all: it is shown when ANY is
 *          viewable and each section inside gates itself on its own area.
 *
 * The UI never decides a role's rights — the server sends the permission list.
 */
export const TAB_AREAS = [
  { id: 'Overview', area: 'overview' },
  { id: 'Feature Flags', area: 'flags' },
  { id: 'Announcements', area: 'announcements' },
  { id: 'Rules', area: 'policies' },
  { id: 'Deities', area: 'content' },
  { id: 'Temples', area: 'content' },
  { id: 'Aartis', area: 'content' },
  { id: 'Festivals', area: 'content' },
  { id: 'Sevas', area: 'content' },
  { id: 'Poojas', area: 'content' },
  { id: 'Chadhava', area: 'content' },
  { id: 'Offerings', area: 'content' },
  { id: 'Bookings', area: 'orders' },
  { id: 'Knowledge', area: 'content' },
  { id: 'FAQs', area: 'content' },
  { id: 'Home layout', area: 'content' },
  { id: 'Home slider', area: 'content' },
  { id: 'Live darshan', area: 'content' },
  { id: 'Horoscope', area: 'horoscope' },
  { id: 'Panchang', area: 'panchang' },
  { id: 'Reminders', area: 'content' },
  { id: 'Alert Tones', area: 'content' },
  { id: 'Wallpapers', area: 'content' },
  { id: 'Astrologers', group: 'Astrologer calls', area: 'astrologers' },
  // Packs are `money`; the ledger and "Adjust a wallet" are `wallets`.
  { id: 'Coins & Wallets', group: 'Astrologer calls', area: ['money', 'wallets'] },
  // Call log + live calls are `calls`; payouts are `payouts`; billing rules are `money`.
  { id: 'Calls & Payouts', group: 'Astrologer calls', area: ['calls', 'payouts', 'money'] },
  { id: 'Settings', area: 'content' },
  { id: 'Operators', area: 'operators' },
  { id: 'Users', area: 'devotees' },
  { id: 'Coin Orders', area: 'orders' },
  { id: 'Visitors', area: 'overview' },
];
