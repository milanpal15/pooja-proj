import { AstrologersPage } from '../features/astrologers/index.js';
import { BookingsPage } from '../features/bookings/index.js';
import { CallsPage } from '../features/calls/index.js';
import { CoinsPage } from '../features/coins/index.js';
import {
  aartiResource,
  announcementResource,
  contentPage,
  deityResource,
  faqResource,
  festivalResource,
  knowledgeResource,
  panchangResource,
  reminderResource,
  settingResource,
  sevaResource,
  templeResource,
  toneResource,
  wallpaperStyleResource,
} from '../features/content/index.js';
import { ChadhavaPage } from '../features/chadhava/index.js';
import { FlagsPage } from '../features/flags/index.js';
import { HomeLayoutPage } from '../features/home-layout/index.js';
import { HomeSliderPage } from '../features/home-slider/index.js';
import { HoroscopePage } from '../features/horoscope/index.js';
import { OfferingsPage } from '../features/offerings/index.js';
import { OperatorsPage } from '../features/operators/index.js';
import { OverviewPage } from '../features/overview/index.js';
import { CoinOrdersPage } from '../features/coin-orders/index.js';
import { PoliciesPage } from '../features/policies/index.js';
import { PoojasPage } from '../features/poojas/index.js';
import { UsersPage } from '../features/users/index.js';
import { VisitorsPage } from '../features/visitors/index.js';
import { TAB_AREAS } from './tab-areas.js';

/**
 * THE TAB REGISTRY (DESIGN.md §15.2, §21.6). One entry per tab, in sidebar
 * order: `tab-areas.js` says what each is and which AREA it belongs to, this
 * file adds the page that renders it. The sidebar, the access filter and the
 * renderer all read the result, so adding a tab is adding a line to each.
 *
 * Pages render with { me, setOnline, area }; a content tab hands `area` to
 * ContentManager, which derives its read-only mode from `canEdit(area)`.
 */
const PAGES = {
  Overview: OverviewPage,
  'Feature Flags': FlagsPage,
  Announcements: contentPage(announcementResource),
  Rules: PoliciesPage,
  Deities: contentPage(deityResource),
  Temples: contentPage(templeResource),
  Aartis: contentPage(aartiResource),
  Festivals: contentPage(festivalResource),
  Sevas: contentPage(sevaResource),
  Poojas: PoojasPage,
  Chadhava: ChadhavaPage,
  Offerings: OfferingsPage,
  Bookings: BookingsPage,
  Knowledge: contentPage(knowledgeResource),
  FAQs: contentPage(faqResource),
  'Home layout': HomeLayoutPage,
  'Home slider': HomeSliderPage,
  Horoscope: HoroscopePage,
  Panchang: contentPage(panchangResource),
  Reminders: contentPage(reminderResource),
  'Alert Tones': contentPage(toneResource),
  Wallpapers: contentPage(wallpaperStyleResource),
  Astrologers: AstrologersPage,
  'Coins & Wallets': CoinsPage,
  'Calls & Payouts': CallsPage,
  Settings: contentPage(settingResource),
  Operators: OperatorsPage,
  Users: UsersPage,
  'Coin Orders': CoinOrdersPage,
  Visitors: VisitorsPage,
};

export const TABS = TAB_AREAS.map((t) => {
  if (!PAGES[t.id]) throw new Error(`tabs.js: no page for tab "${t.id}"`);
  return { ...t, Component: PAGES[t.id] };
});
