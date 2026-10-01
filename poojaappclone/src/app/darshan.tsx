import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import {
  ArchImage,
  Badge,
  Button,
  Card,
  Icon,
  Screen,
  Type,
} from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { LivePlayer } from '@/components/darshan/live-player';
import { DEITY_IMAGES } from '@/constants/deity-images';
import { TEMPLES } from '@/constants/temples';
import { useContent } from '@/context/content';
import { useLanguage } from '@/context/language';
import { Radius, Space, useTheme } from '@/theme';

/**
 * Live Temple Darshan.
 *
 * The stream itself is still a still image — real HLS ingest is explicitly
 * out of scope in the design doc. Everything around it is now systemised: the
 * media sits under a temple arch, the overlay pills are glass rather than
 * opaque white, and "Donate Now" is the screen's single primary action.
 */
export default function DarshanScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const { announcement, deityArt, temples } = useContent();
  const [liked, setLiked] = useState(false);

  /*
   * Which temple this screen is showing.
   *
   * It used to hardcode "Kashi Vishwanath" and `DEITY_IMAGES.shiva`, so every
   * deployment claimed the same temple regardless of what the dashboard held.
   * First enabled temple wins; the bundled catalogue covers the backend being
   * unreachable.
   */
  const remote = temples[0];
  const templeName = remote?.name ?? TEMPLES[0]?.name ?? '';
  const art = deityArt(remote?.deitySlug ?? 'shiva');

  /*
   * The feed, when the dashboard has published one for this temple.
   *
   * With a URL the screen plays the real stream and the LIVE badge is
   * earned. Without one it falls back to the still artwork and shows no
   * badge — a permanent "LIVE" over a photograph is a claim the app cannot
   * keep, and that is what this screen used to do.
   */
  const liveUrl = (remote as { liveUrl?: string } | undefined)?.liveUrl?.trim();
  const isLive = !!liveUrl;

  return (
    <Screen tabBar={false}>
      <AppBar
        title={templeName ? `${t('live_darshan')}: ${templeName}` : t('live_darshan')}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ArchImage source={art ?? DEITY_IMAGES.shiva} height={400}>
          {/* The real feed sits inside the arch, over the still, so the
              screen keeps its shape whether or not a stream exists. */}
          {isLive && (
            <View style={styles.feed}>
              <LivePlayer url={liveUrl} height={400} label={t('live_darshan')} />
            </View>
          )}
          {/* Scrims top and bottom so the overlays stay legible whatever the
              frame behind them happens to be. */}
          <View style={[styles.scrimTop, { backgroundColor: c.scrim }]} pointerEvents="none" />
          {/* No invented view count. Nothing counts views, so there is no
              number to show — the pill returns when something does. */}
          {isLive && (
            <View style={styles.topRow} pointerEvents="none">
              <Badge label={t('live')} tone="live" />
            </View>
          )}

          <View style={styles.overlayBtns}>
            {/* Counts removed: "2.1K" likes and "950" shares were invented,
                and nothing on the backend tallies either. The controls still
                work; they just no longer report numbers nobody measured. */}
            <GlassPill
              icon="heart"
              filled={liked}
              onPress={() => setLiked((l) => !l)}
              accessibilityLabel={liked ? 'Unlike' : 'Like'}
            />
            <GlassPill
              icon="share"
              accessibilityLabel="Share"
              onPress={() =>
                Share.share({
                  message: templeName
                    ? lang === 'hi'
                      ? `${templeName} के दर्शन करें`
                      : `Darshan at ${templeName}`
                    : t('live_darshan'),
                }).catch(() => {})
              }
            />
          </View>
        </ArchImage>

        {/* The live announcement from the dashboard. This used to be one
            hardcoded i18n string shown on every temple, forever. Hidden when
            nothing is published rather than inventing a notice. */}
        {!!announcement && (
          <Card variant="sunken">
            <Type v="bodyMd">
              <Type v="titleMd">{announcement.title || t('temple_announcement')}: </Type>
              {announcement.body}
            </Type>
          </Card>
        )}

        <Button
          label={t('donate_now')}
          icon="gift"
          size="lg"
          block
          onPress={() => router.push('/chadhava')}
        />
      </ScrollView>
    </Screen>
  );
}

function GlassPill({
  icon,
  label,
  filled = false,
  onPress,
  accessibilityLabel,
}: {
  icon: 'heart' | 'share';
  /** Optional — omitted when there is no real number to report. */
  label?: string;
  filled?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderColor: c.goldHairline,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <Icon name={icon} size={17} color={filled ? c.primary : c.goldInk} filled={filled} />
      {/* Without a label the pill collapses to a round icon button, rather
          than leaving a gap where an invented number used to sit. */}
      {!!label && (
        <Type v="labelMd" tone="goldInk" numeric>
          {label}
        </Type>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg },

  feed: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 96, opacity: 0.55 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.md,
  },
  viewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  overlayBtns: { position: 'absolute', left: Space.md, bottom: Space.md, gap: Space.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
});
