import { type ImageSourcePropType, StyleSheet, View } from 'react-native';

import { ArchImage, Badge } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

import { GlassPill } from './GlassPill';
import { LivePlayer } from './LivePlayer';

/** The temple arch: the stream (or still), the LIVE badge, and the like / share pills. */
export function DarshanStage({
  art,
  liveUrl,
  liveLabel,
  liveBadge,
  liked,
  onToggleLike,
  onShare,
}: {
  art: ImageSourcePropType | undefined;
  liveUrl: string | undefined;
  /** Accessibility label for the player. */
  liveLabel: string;
  liveBadge: string;
  liked: boolean;
  onToggleLike: () => void;
  onShare: () => void;
}) {
  const { c } = useTheme();
  const isLive = !!liveUrl;

  return (
    <ArchImage source={art} height={400}>
      {/* The real feed sits inside the arch, over the still, so the
          screen keeps its shape whether or not a stream exists. */}
      {isLive && (
        <View style={styles.feed}>
          <LivePlayer url={liveUrl} height={400} label={liveLabel} />
        </View>
      )}
      {/* Scrims top and bottom so the overlays stay legible whatever the
          frame behind them happens to be. */}
      <View style={[styles.scrimTop, { backgroundColor: c.scrim }]} pointerEvents="none" />
      {/* No invented view count. Nothing counts views, so there is no
          number to show — the pill returns when something does. */}
      {isLive && (
        <View style={styles.topRow} pointerEvents="none">
          <Badge label={liveBadge} tone="live" />
        </View>
      )}

      <View style={styles.overlayBtns}>
        {/* Counts removed: "2.1K" likes and "950" shares were invented,
            and nothing on the backend tallies either. The controls still
            work; they just no longer report numbers nobody measured. */}
        <GlassPill
          icon="heart"
          filled={liked}
          onPress={onToggleLike}
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
        />
        <GlassPill icon="share" accessibilityLabel="Share" onPress={onShare} />
      </View>
    </ArchImage>
  );
}

const styles = StyleSheet.create({
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
});
