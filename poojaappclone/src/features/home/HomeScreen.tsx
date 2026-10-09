import { ScrollView, StyleSheet, View } from 'react-native';

import { Screen, useScrollPadding } from '@/components/ui';
import { WalletChip } from '@/features/wallet';
import { useLanguage } from '@/i18n';
import { useAdmin } from '@/providers/admin';
import { useAuth } from '@/providers/auth';
import { useContent } from '@/providers/content';

import { AstrologerBlock } from './components/AstrologerBlock';
import { DailyBlocks } from './components/DailyBlocks';
import { DeityRow } from './components/DeityRow';
import { HomeHeader } from './components/HomeHeader';
import { HomeSlider } from './components/HomeSlider';
import { ListenBlock } from './components/ListenBlock';
import { MusicFab } from './components/MusicFab';
import { OfferShelves } from './components/OfferShelves';
import { QuickGrid, type QuickItem } from './components/QuickGrid';
import { RashiRow } from './components/RashiRow';
import { ShareCard } from './components/ShareCard';
import { ShelfSections } from './components/ShelfSections';
import { TemplesNearYou } from './components/TemplesNearYou';
import { FeaturedBlock, NextSevaBlock } from './components/PromoBlocks';
import { SearchBar } from './components/SearchBar';
import { useGo } from './hooks/use-go';
import { useGrantedLocation } from './hooks/use-granted-location';
import { useHomeAstrologers, useHomeBookings, useHomeChadhava, useHomePoojas } from './hooks/use-home-feeds';
import { useHomeSlides } from './hooks/use-home-slides';
import { avatarInitial, firstName } from './lib/greeting';
import { searchPath } from './lib/search';

/**
 * Home — the approved fixed layout. Only the slider (and the four shelf
 * sections after Rashifal) are dashboard-managed; every other block draws from
 * its own live data and is OMITTED, not blanked, when it has none. Nothing here
 * can crash offline: API blocks fail silently, the rest is cached/computed.
 */
export function HomeScreen() {
  const go = useGo();
  const { user } = useAuth();
  const { flags } = useAdmin();
  const { t, lang } = useLanguage();
  const { deityList, deityArt } = useContent();
  const pad = useScrollPadding(100);
  const here = useGrantedLocation();
  const slides = useHomeSlides();
  const poojas = useHomePoojas();
  const chadhava = useHomeChadhava();
  const bookings = useHomeBookings();
  const astro = useHomeAstrologers();

  const quick = ([
    { key: 'pooja', label: t('hv_q_pooja'), icon: 'diya', href: '/poojas' },
    { key: 'chadhava', label: t('hv_q_chadhava'), icon: 'marigold', href: '/chadhava', off: flags.chadhava === false },
    { key: 'live', label: t('hv_q_live'), icon: 'play', href: '/darshan', badge: t('hv_live'), off: flags.liveDarshan === false },
    { key: 'temples', label: t('hv_q_temples'), icon: 'temple', href: '/temples' },
    { key: 'panchang', label: t('hv_q_panchang'), icon: 'calendar', href: '/panchang' },
    { key: 'rashifal', label: t('hv_q_rashifal'), icon: 'star', href: '/horoscope' },
    { key: 'bhajan', label: t('hv_q_bhajan'), icon: 'music', href: '/bhajan', off: flags.bhajan === false },
    { key: 'katha', label: t('hv_q_katha'), icon: 'lotus', href: '/bhajan', off: flags.bhajan === false },
  ] as (QuickItem & { off?: boolean })[]).filter((q) => !q.off);

  const festivalHi = Object.fromEntries((poojas.data?.filters.festivals ?? []).map((f) => [f.slug, f.nameHi ?? '']));

  return (
    <Screen watermark>
      <HomeHeader
        greeting={t('hv_greeting')}
        name={firstName(user?.name)}
        initial={avatarInitial(user?.name)}
        profileLabel={t('profile')}
        remindersLabel={t('daily_reminders')}
        wallet={flags.astrologerCalls ? <WalletChip /> : undefined}
        onProfile={() => go('/profile')}
        onReminders={() => go('/alarm')}
      />
      <ScrollView contentContainerStyle={[styles.scroll, pad]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.gutter}>
          <SearchBar placeholder={t('hv_search')} onSubmit={(q) => go(searchPath(q))} />
        </View>
        <HomeSlider slides={slides} />
        {deityList.length > 0 && (
          <DeityRow deities={deityList} art={deityArt} onPick={(id) => go(`/pooja?deity=${encodeURIComponent(id)}&ts=${Date.now()}`)} />
        )}
        <View style={[styles.gutter, styles.stack]}>
          <DailyBlocks here={here} />
          <FeaturedBlock poojas={poojas.data?.poojas} festivalHi={festivalHi} loading={poojas.status === 'loading'} onOpen={go} />
          <QuickGrid items={quick} onOpen={go} />
          <NextSevaBlock bookings={bookings.data} onOpen={go} />
          <OfferShelves poojas={poojas} chadhava={chadhava} onOpen={go} />
          <TemplesNearYou here={here} onOpen={go} />
          <RashiRow onOpen={() => go('/horoscope')} />
          <ShelfSections hi={lang === 'hi'} />
          {flags.astrologerCalls && <AstrologerBlock list={astro.data} loading={astro.status === 'loading'} onOpen={() => go('/astrologers')} />}
          <ListenBlock onOpen={() => go('/bhajan')} />
          <ShareCard />
        </View>
      </ScrollView>
      <MusicFab label={t('hv_listen')} onPress={() => go('/bhajan')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 16, paddingTop: 2 },
  gutter: { paddingHorizontal: 16 },
  stack: { gap: 24 },
});
