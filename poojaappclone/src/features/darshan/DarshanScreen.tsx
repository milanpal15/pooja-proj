import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet } from 'react-native';

import { Button, Card, Screen, Type } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { DarshanStage } from './components/DarshanStage';

/**
 * Live Temple Darshan.
 *
 * The stream itself is still a still image — real HLS ingest is explicitly
 * out of scope in the design doc. Everything around it is now systemised: the
 * media sits under a temple arch, the overlay pills are glass rather than
 * opaque white, and "Donate Now" is the screen's single primary action.
 */
export function DarshanScreen() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const { announcement, deityArt, templeList, temples } = useContent();
  const [liked, setLiked] = useState(false);

  /*
   * Which temple this screen is showing.
   *
   * It used to hardcode "Kashi Vishwanath" and a bundled Shiva still, so every
   * deployment claimed the same temple regardless of what the dashboard held.
   * First enabled temple wins; the bundled catalogue covers the backend being
   * unreachable.
   */
  const remote = temples[0];
  const templeName = remote?.name ?? templeList[0]?.name ?? '';
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

  return (
    <Screen tabBar={false}>
      <AppBar
        title={templeName ? `${t('live_darshan')}: ${templeName}` : t('live_darshan')}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <DarshanStage
          art={art}
          liveUrl={liveUrl}
          liveLabel={t('live_darshan')}
          liveBadge={t('live')}
          liked={liked}
          onToggleLike={() => setLiked((l) => !l)}
          onShare={() =>
            Share.share({
              message: templeName
                ? lang === 'hi'
                  ? `${templeName} के दर्शन करें`
                  : `Darshan at ${templeName}`
                : t('live_darshan'),
            }).catch(() => {})
          }
        />

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

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg },
});
