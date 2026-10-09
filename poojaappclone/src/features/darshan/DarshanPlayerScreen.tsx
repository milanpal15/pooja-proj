import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, NoContent, Screen, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { type LiveCard, sendLiveJai } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useSavedTemples } from '@/lib/saved-temples';
import { Space, useTheme } from '@/theme';

import { ActionGrid } from './components/ActionGrid';
import { JaiCard } from './components/JaiCard';
import { MoreLive } from './components/MoreLive';
import { OfferBar } from './components/OfferBar';
import { PlayerHero } from './components/PlayerHero';
import { SectionHead } from './components/SectionHead';
import { TodayList } from './components/TodayList';
import { useAartiReminders } from './hooks/use-aarti-reminders';
import { useLiveDetail } from './hooks/use-live-detail';
import { playerHref, time12 } from './lib/live-logic';

/**
 * Live Darshan player (board "LivePlayer"): the stream, title + save heart, Jai, quick actions,
 * today's aartis at this temple, more live darshan, and a sticky "Offer during the aarti" bar.
 */
export function DarshanPlayerScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { stream, loading, failed, missing, reload } = useLiveDetail(String(slug ?? ''));
  const { isSaved, toggleSave } = useSavedTemples();
  const reminders = useAartiReminders();

  // The count the server returned for this devotee's own tap wins over the (older) loaded one.
  const [tapped, setTapped] = useState<number | null>(null);
  const [jaiBusy, setJaiBusy] = useState(false);
  const jai = tapped ?? stream?.jaiCount ?? null;

  if (!stream) {
    return (
      <Screen tabBar={false}>
        <View style={[styles.gone, { paddingTop: insets.top + Space.sm }]}>
          <IconButton name="back" label={t('ld_back')} onPress={() => router.back()} color={c.onSurface} />
          {loading ? (
            <ActivityIndicator color={c.primary} style={styles.spin} />
          ) : (
            <View style={styles.msg}>
              <NoContent title={missing ? t('ld_gone') : t('ld_unreachable')} body="" />
              {!missing && failed && <Button label={t('ld_retry')} variant="secondary" onPress={reload} />}
            </View>
          )}
        </View>
      </Screen>
    );
  }

  const name = pick(lang, stream.templeName, stream.templeNameHi);
  const live = stream.state === 'live';
  const aartiNow = stream.currentAarti ? pick(lang, stream.currentAarti.name, stream.currentAarti.nameHi) : '';
  const since = stream.startedAt ? time12(localTime(stream.startedAt)) : '';
  const kicker = live && aartiNow ? `${aartiNow}${since ? ` · ${t('ld_live_since')} ${since}` : ''}` : '';
  const saved = isSaved(stream.templeSlug);
  const jaiLabel = pick(lang, stream.jaiText || t('ld_jai'), stream.jaiTextHi) || t('ld_jai');

  // The aarti the "Remind me" tile acts on: the next one still to come today.
  const upcoming = stream.aartisToday.find((a) => a.status === 'upcoming');

  const tapJai = async () => {
    setJaiBusy(true);
    try {
      const n = await sendLiveJai(stream.slug);
      if (n !== null) setTapped(n);
    } catch {
      // Offline or signed out: a Jai that did not land is not worth interrupting darshan for.
    } finally {
      setJaiBusy(false);
    }
  };

  const remindNext = () => {
    if (!upcoming) return;
    void reminders.toggle({
      streamSlug: stream.slug,
      time: upcoming.time,
      name: upcoming.name,
      title: pick(lang, upcoming.name, upcoming.nameHi),
      templeName: name,
      body: t('ld_notif_body'),
    });
  };

  const navigate = () => {
    const { lat, lng } = stream.temple;
    const q = typeof lat === 'number' && typeof lng === 'number' ? `${lat},${lng}` : `${name} ${stream.place}`;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`).catch(() => {});
  };

  const openChadhava = () =>
    stream.chadhava
      ? router.push({ pathname: '/chadhava/[slug]', params: { slug: stream.chadhava.slug } })
      : router.push('/chadhava');
  const openPooja = () =>
    stream.pooja ? router.push({ pathname: '/pooja/[slug]', params: { slug: stream.pooja.slug } }) : router.push('/poojas');
  const openOther = (card: LiveCard) => router.replace(playerHref(card.slug));

  return (
    <Screen tabBar={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <PlayerHero stream={stream} />

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              {!!kicker && (
                <Type v="labelMd" tone="live">
                  {kicker}
                </Type>
              )}
              <Type v="headlineMd">{name}</Type>
              {!!stream.place && (
                <Type v="bodySm" tone="onSurfaceVariant">
                  {stream.place}
                </Type>
              )}
            </View>
            <IconButton
              name="heart"
              label={saved ? t('ld_unsave') : t('ld_save')}
              size={44}
              variant="solid"
              color={c.primary}
              onPress={() => void toggleSave(stream.templeSlug)}
              style={saved ? { backgroundColor: c.accentContainer } : undefined}
            />
          </View>

          {live && !!stream.currentAarti && <JaiCard label={jaiLabel} count={jai} busy={jaiBusy} onPress={tapJai} />}

          <ActionGrid
            actions={[
              { key: 'chadhava', icon: 'marigold', label: t('ld_chadhava'), onPress: openChadhava },
              { key: 'pooja', icon: 'diya', label: t('ld_pooja'), onPress: openPooja },
              {
                key: 'remind',
                icon: 'bell',
                label: upcoming && reminders.isOn(stream.slug, upcoming.time, upcoming.name) ? t('ld_reminder_on') : t('ld_remind'),
                active: !!upcoming && reminders.isOn(stream.slug, upcoming.time, upcoming.name),
                onPress: upcoming ? remindNext : () => void Promise.resolve(),
              },
              { key: 'navigate', icon: 'mapPin', label: t('ld_navigate'), onPress: navigate },
            ]}
          />

          {stream.aartisToday.length > 0 && (
            <View style={styles.section}>
              <Type v="titleMd">{t('ld_today_here')}</Type>
              <TodayList aartis={stream.aartisToday} />
            </View>
          )}
        </View>

        {stream.more.length > 0 && (
          <View style={styles.section}>
            <SectionHead title={t('ld_more')} action={t('ld_see_all')} onAction={() => router.replace('/darshan')} />
            <MoreLive cards={stream.more} onOpen={openOther} />
          </View>
        )}
      </ScrollView>

      {stream.chadhava && <OfferBar fromCoins={stream.chadhava.fromCoins} onPress={openChadhava} />}
    </Screen>
  );
}

/** Local "HH:MM" of an ISO instant. */
function localTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  body: { padding: Space.margin, gap: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titleText: { flex: 1, gap: 2 },
  section: { gap: 10 },
  gone: { flex: 1, paddingHorizontal: Space.sm },
  spin: { marginTop: Space.xxl },
  msg: { padding: Space.margin, gap: Space.md, alignItems: 'center' },
});
