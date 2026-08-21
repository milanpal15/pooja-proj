import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  ArchImage,
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  Screen,
  Type,
} from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { DEITY_IMAGES } from '@/constants/deity-images';
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
  const { t } = useLanguage();
  const [liked, setLiked] = useState(false);

  return (
    <Screen tabBar={false}>
      <AppBar
        title={`${t('live_darshan')}: Kashi Vishwanath`}
        right={<IconButton name="settings" label={t('settings')} size={40} />}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ArchImage source={DEITY_IMAGES.shiva} height={400}>
          {/* Scrims top and bottom so the overlays stay legible whatever the
              frame behind them happens to be. */}
          <View style={[styles.scrimTop, { backgroundColor: c.scrim }]} />
          <View style={styles.topRow}>
            <Badge label={t('live')} tone="live" />
            <View style={styles.viewPill}>
              <Icon name="star" size={13} color="#FFFFFF" />
              <Type v="labelSm" color="#FFFFFF">
                15.4K {t('views')}
              </Type>
            </View>
          </View>

          <View style={styles.overlayBtns}>
            <GlassPill
              icon="heart"
              filled={liked}
              label="2.1K"
              onPress={() => setLiked((l) => !l)}
              accessibilityLabel={liked ? 'Unlike' : 'Like'}
            />
            <GlassPill icon="share" label="950" accessibilityLabel="Share" />
          </View>
        </ArchImage>

        <Card variant="sunken">
          <Type v="bodyMd">
            <Type v="titleMd">{t('temple_announcement')}: </Type>
            {t('announcement_text')}
          </Type>
        </Card>

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
  label: string;
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
      <Type v="labelMd" tone="goldInk" numeric>
        {label}
      </Type>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg },

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
