import AppTabs, { type TabDef } from '@/components/app-tabs';

/** Astrologer shell: Home · Calls · Earnings · Profile. No devotee tabs. */
const TABS: TabDef[] = [
  { name: 'astro-home', href: '/astro-home', icon: 'home', labelKey: 'tab_home' },
  { name: 'astro-calls', href: '/astro-calls', icon: 'bell', labelKey: 'tab_calls' },
  { name: 'astro-earnings', href: '/astro-earnings', icon: 'sparkle', labelKey: 'tab_earnings' },
  { name: 'astro-profile', href: '/astro-profile', icon: 'person', labelKey: 'tab_profile' },
];

export default function AstrologerTabsLayout() {
  return <AppTabs tabs={TABS} />;
}
