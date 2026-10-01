import { useAudioPlayer } from 'expo-audio';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Card,
  Icon,
  type IconName,
  Screen,
  Type,
  useScrollPadding,
} from '@/components/ui';
import { SOUNDS } from '@/constants/sounds';
import { BottomTabInset } from '@/constants/theme';
import { type StringKey, useLanguage } from '@/context/language';
import { Radius, Space, useTheme } from '@/theme';

/**
 * Bhajan — the Premium Media Library.
 *
 * This is a sanctum screen, so it no longer paints its own backdrop: it hand-
 * rolled a twelve-band gradient with `mixHex`, which `Screen mode="sanctum"`
 * now provides for every immersive screen at once.
 *
 * The headline was `#2A1606` on a `#A9631C` band — dark brown on dark brown,
 * about 1.3:1, effectively invisible on device. It takes the sanctum's own
 * ink now.
 */

const CATEGORIES: { key: string; labelKey: StringKey; icon: IconName }[] = [
  { key: 'morning', labelKey: 'morning_mantras', icon: 'sparkle' },
  { key: 'evening', labelKey: 'evening_aarti', icon: 'diya' },
  { key: 'meditation', labelKey: 'meditation_music', icon: 'lotus' },
];

const TRACKS = [
  { id: 't1', title: 'Om Jai Jagdish Hare', artist: 'Anup Jalota', len: '5:10', category: 'evening' },
  { id: 't2', title: 'Hanuman Chalisa', artist: 'Hariharan', len: '7:30', category: 'morning' },
  { id: 't3', title: 'Gayatri Mantra', artist: 'Suresh Wadkar', len: '6:15', category: 'morning' },
  { id: 't4', title: 'Shiv Tandav Stotram', artist: 'Shankar Mahadevan', len: '8:02', category: 'evening' },
  { id: 't5', title: 'Achyutam Keshavam', artist: 'Vivek Prakash', len: '5:45', category: 'meditation' },
  { id: 't6', title: 'Aigiri Nandini', artist: 'Rajalakshmee', len: '6:30', category: 'meditation' },
];

type Track = (typeof TRACKS)[number];

export default function BhajanScreen() {
  return (
    <Screen mode="sanctum">
      <BhajanBody />
    </Screen>
  );
}

function BhajanBody() {
  const { c } = useTheme();
  const { t } = useLanguage();
  const scrollPad = useScrollPadding(96);
  const player = useAudioPlayer(SOUNDS.aarti);
  const [nowPlaying, setNowPlaying] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [category, setCategory] = useState('morning');

  // Filter tracks to the selected category.
  const filteredTracks = TRACKS.filter((tr) => tr.category === category);

  const play = useCallback(
    (track: Track) => {
      try {
        player.loop = true;
        player.seekTo(0);
        player.play();
      } catch {
        // A missing or unreadable asset shouldn't take the screen down; the
        // row still selects so the UI stays honest about what was tapped.
      }
      setNowPlaying(track);
      setPlaying(true);
    },
    [player],
  );

  const toggle = useCallback(() => {
    try {
      if (playing) player.pause();
      else player.play();
    } catch {
      /* see above */
    }
    setPlaying((p) => !p);
  }, [player, playing]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, scrollPad]}
        showsVerticalScrollIndicator={false}>
        <Type v="display" style={styles.title}>
          {t('media_library')}
        </Type>

        <View style={styles.cats}>
          {CATEGORIES.map((cat) => {
            const active = cat.key === category;
            return (
              <Pressable
                key={cat.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setCategory(cat.key)}
                style={[
                  styles.cat,
                  {
                    backgroundColor: active ? c.containerHighest : c.containerLow,
                    borderColor: active ? c.gold : c.glassBorder,
                  },
                ]}>
                <View style={[styles.catIcon, { backgroundColor: c.container }]}>
                  <Icon name={cat.icon} size={24} color={active ? c.gold : c.onSurfaceVariant} />
                </View>
                <Type v="labelSm" center numberOfLines={2} style={styles.catLabel}>
                  {t(cat.labelKey)}
                </Type>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.list}>
          {filteredTracks.map((tr) => {
            const active = nowPlaying?.id === tr.id;
            return (
              <Pressable
                key={tr.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => play(tr)}
                style={[
                  styles.row,
                  {
                    backgroundColor: active ? c.containerHighest : c.containerLow,
                    borderColor: active ? c.gold : c.glassBorder,
                  },
                ]}>
                <View style={[styles.art, { backgroundColor: c.container }]}>
                  <Icon
                    name={active && playing ? 'pause' : 'music'}
                    size={20}
                    color={active ? c.gold : c.onSurfaceVariant}
                  />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Type v="titleSm" numberOfLines={1}>
                    {tr.title}
                  </Type>
                  <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
                    {tr.artist}
                  </Type>
                </View>
                <Type v="labelMd" tone="onSurfaceVariant" numeric>
                  {tr.len}
                </Type>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Mini player, docked above the tab bar. */}
      {nowPlaying && (
        <Card variant="glass" padded={false} style={styles.mini}>
          <View style={styles.miniRow}>
            <View style={[styles.artSmall, { backgroundColor: c.container }]}>
              <Icon name="music" size={17} color={c.gold} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Type v="titleSm" numberOfLines={1}>
                {nowPlaying.title}
              </Type>
              <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
                {nowPlaying.artist}
              </Type>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause' : 'Play'}
              onPress={toggle}
              style={({ pressed }) => [
                styles.playBtn,
                { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 },
              ]}>
              <Icon name={playing ? 'pause' : 'play'} size={18} color={c.onAccent} />
            </Pressable>
          </View>
        </Card>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Space.margin, paddingTop: Space.sm, gap: Space.lg },
  title: { maxWidth: 260 },

  cats: { flexDirection: 'row', gap: Space.sm },
  cat: {
    flex: 1,
    minWidth: 0,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Space.md,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: Space.sm,
  },
  catLabel: { width: '100%' },
  catIcon: {
    width: 50,
    height: 50,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  list: { gap: Space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 10,
  },
  art: {
    width: 46,
    height: 46,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  mini: {
    position: 'absolute',
    left: Space.margin,
    right: Space.margin,
    bottom: BottomTabInset + Space.sm,
    borderRadius: Radius.full,
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  artSmall: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
