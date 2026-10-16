/**
 * THE MODULE REGISTRY (docs/DASHBOARD_REVAMP.md §4, docs/RELEASES.md §7). Pure data, no React, so the router, the
 * palette, the Roles preview and scripts/check-access.mjs all read the same list. app/tab-areas.js re-exports it
 * and app/tabs.js adds each module's page.
 *
 *   id          the module's name — its old `#Tab` hash, so every bookmark keeps working
 *   title       what the sidebar, breadcrumbs and heading say
 *   group       a GROUPS key (null for Overview, which sits above the groups)
 *   area        the permission area(s): shown when the session can `<area>:view`; read-only without `edit`
 *   route       '/<group>/<slug>' — the nested hash route (`#/people/users`, plus optional `/<id>` segments)
 *   breadcrumb  ['Group', 'Title'] shown in the page header
 *   searchable  appears in the ⌘K palette
 *   keywords    extra words the palette matches
 *   records     'users' | 'temples': the palette also searches these records through the module's list endpoint
 *   children    [{ slug, title, keywords }] sub-pages under the module (`#/people/users/blocked-devices`): they have their
 *               own breadcrumb and palette entry but no sidebar item and the same area as the module
 *
 * The UI never decides a role's rights — the server sends the permission list.
 */
export const GROUPS = [
  { key: 'people', label: 'People' },
  { key: 'releases', label: 'Releases & control' },
  { key: 'experience', label: 'Experience' },
  { key: 'content', label: 'Content' },
  { key: 'commerce', label: 'Commerce' },
  { key: 'insights', label: 'Insights' },
  { key: 'admin', label: 'Admin' },
];

const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const groupLabel = (key) => GROUPS.find((g) => g.key === key)?.label ?? '';

function mod(id, group, area, extra = {}) {
  const title = extra.title ?? id;
  const s = extra.slug ?? slug(id);
  const route = group ? `/${group}/${s}` : `/${s}`;
  return {
    id,
    title,
    group,
    area,
    route,
    breadcrumb: group ? [groupLabel(group), title] : [title],
    searchable: true,
    keywords: '',
    ...extra,
  };
}

/** In sidebar order: Overview first, then each group's modules. */
export const MODULES = [
  mod('Overview', null, 'overview', { keywords: 'home dashboard summary charts' }),

  mod('Users', 'people', 'devotees', {
    keywords: 'devotees accounts phone block users 360',
    records: 'users',
    children: [{ slug: 'blocked-devices', title: 'Blocked devices', keywords: 'device ban blocklist deviceId' }],
  }),
  mod('Announcements', 'people', 'announcements', { keywords: 'message notice banner modal' }),

  mod('App releases', 'releases', 'releases', { keywords: 'version build update minimum blocked maintenance policy android' }),
  mod('Feature Flags', 'releases', 'flags', { title: 'Feature flags', keywords: 'switch toggle kill' }),
  mod('Settings', 'releases', 'content', { keywords: 'config prasad fee support contacts' }),

  mod('Home layout', 'experience', 'content', { keywords: 'sections builder audience' }),
  mod('Home slider', 'experience', 'content', { keywords: 'banner hero carousel slides' }),
  mod('FAQs', 'experience', 'content', { keywords: 'help questions' }),
  mod('Reminders', 'experience', 'content', { keywords: 'daily alarm' }),
  mod('Alert Tones', 'experience', 'content', { title: 'Alert tones', keywords: 'sound audio alarm' }),
  mod('Wallpapers', 'experience', 'content', { keywords: 'background image styles' }),

  mod('Temples', 'content', 'content', { keywords: 'mandir map darshan', records: 'temples' }),
  mod('Deities', 'content', 'content', { keywords: 'lords gods murti' }),
  mod('Aartis', 'content', 'content', { keywords: 'bhajan audio' }),
  mod('Festivals', 'content', 'content', { keywords: 'calendar vrat' }),
  mod('Poojas', 'content', 'content', { keywords: 'seva packages' }),
  mod('Chadhava', 'content', 'content', { keywords: 'offering listing' }),
  mod('Offerings', 'content', 'content', { keywords: 'chadhava items prices' }),
  mod('Sevas', 'content', 'content', { keywords: 'legacy pooja prices' }),
  mod('Events', 'content', 'events', { keywords: 'tasks badges nine-day' }),
  mod('Live darshan', 'content', 'content', { keywords: 'stream youtube live' }),
  mod('Horoscope', 'content', 'horoscope', { keywords: 'rashi daily reading' }),
  mod('Panchang', 'content', 'panchang', { keywords: 'almanac tithi' }),
  mod('Knowledge', 'content', 'content', { keywords: 'lore articles' }),

  mod('Bookings', 'commerce', 'orders', { keywords: 'orders reviews pooja performed' }),
  mod('Coin Orders', 'commerce', 'orders', { title: 'Coin orders', keywords: 'razorpay purchases payments' }),
  mod('Coins & Wallets', 'commerce', ['money', 'wallets'], { keywords: 'packs balance ledger adjust' }),
  mod('Astrologers', 'commerce', 'astrologers', { keywords: 'calls invite suspend' }),
  mod('Calls & Payouts', 'commerce', ['calls', 'payouts', 'money'], { keywords: 'refund billing rules paid' }),

  mod('Visitors', 'insights', 'overview', { keywords: 'devices traffic' }),
  mod('Audit log', 'insights', 'audit', { keywords: 'history changes who changed before after export' }),

  mod('Operators', 'admin', 'operators', { keywords: 'dashboard accounts passwords staff' }),
  mod('Roles & permissions', 'admin', 'roles', { slug: 'roles', keywords: 'access matrix custom role' }),
  mod('Approvals', 'admin', 'approvals', { keywords: 'pending review second operator' }),
  mod('Rules', 'admin', 'policies', { title: 'Rules & policies', keywords: 'terms regulations legal' }),
];

/** The sub-page of `module` that `rest` points at (`['blocked-devices']`), or null. */
export const childFor = (module, rest = []) => module?.children?.find((c) => c.slug === rest[0]) ?? null;

/** Every module's children as palette-shaped entries (same area as the parent, so access filtering is unchanged). */
export const childModules = (modules) =>
  modules.flatMap((m) =>
    (m.children ?? []).map((c) => ({
      id: `${m.id}/${c.slug}`,
      title: c.title,
      group: m.group,
      area: m.area,
      route: `${m.route}/${c.slug}`,
      breadcrumb: [...m.breadcrumb, c.title],
      searchable: true,
      keywords: c.keywords ?? '',
      child: true,
    })),
  );

export const moduleById = (id) => MODULES.find((m) => m.id === id) ?? null;
