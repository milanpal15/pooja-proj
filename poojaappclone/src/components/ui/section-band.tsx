import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Radius, Space, useTheme } from '@/theme';

import { Icon } from './icon';
import { Type } from './type';

/**
 * `SectionBand` — the signature shelf of the reference home screen.
 *
 * Every content group there is a coloured band with a centred title flanked by
 * an ornamental rule, sitting on a light card body. The colour is not
 * decoration: it types the shelf, so festivals, scripture and daily guidance
 * are told apart before a word is read.
 *
 * This is the one place the system carries hues outside its own palette. They
 * are deliberately narrow — four fixed tones, chosen once here — rather than
 * per-screen literals, so a fifth kind of shelf has to be a decision rather
 * than an accident.
 */

export type BandTone = 'gold' | 'purple' | 'crimson' | 'forest';

const TONES: Record<BandTone, readonly [string, string]> = {
  gold: ['#C08A1E', '#A97213'],
  purple: ['#563274', '#432459'],
  crimson: ['#C2185B', '#A0134B'],
  forest: ['#0F6B4A', '#0A5238'],
};

export function SectionBand({
  title,
  tone = 'gold',
  children,
  footerLabel,
  onFooter,
}: {
  title: string;
  tone?: BandTone;
  children: React.ReactNode;
  /** Optional "see all" row under the body. */
  footerLabel?: string;
  onFooter?: () => void;
}) {
  const { c } = useTheme();

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={TONES[tone]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.band}>
        <Flourish flip />
        <Type v="titleMd" color="#FFFFFF" numberOfLines={1} style={styles.bandTitle}>
          {title}
        </Type>
        <Flourish />
      </LinearGradient>

      <View style={[styles.body, { backgroundColor: c.containerLowest }]}>
        {children}

        {!!footerLabel && (
          <Pressable
            accessibilityRole="button"
            onPress={onFooter}
            style={({ pressed }) => [styles.footer, pressed && { opacity: 0.7 }]}>
            <Type v="labelMd" tone="primary">
              {footerLabel}
            </Type>
            <Icon name="forward" size={14} color={c.primary} strokeWidth={2.4} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** The ❖—— rule either side of a band title. Drawn, so it scales and tints. */
function Flourish({ flip = false }: { flip?: boolean }) {
  return (
    <View style={[styles.flourish, flip && { transform: [{ scaleX: -1 }] }]}>
      <Svg width="100%" height={12} viewBox="0 0 80 12">
        <Path
          d="M4 6h14"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={1.2}
          strokeLinecap="round"
        />
        {/* A four-petal rosette, the motif the reference uses as a divider. */}
        {[0, 45, 90, 135].map((deg) => (
          <Path
            key={deg}
            transform={`rotate(${deg} 26 6)`}
            d="M26 1.6 C28 4, 28 8, 26 10.4 C24 8, 24 4, 26 1.6 Z"
            fill="rgba(255,255,255,0.75)"
          />
        ))}
        <Path
          d="M34 6h44"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: 12,
    paddingHorizontal: Space.sm,
  },
  bandTitle: { flexShrink: 1, textAlign: 'center' },
  flourish: { flex: 1, maxWidth: 80 },
  body: { padding: Space.cardPadding, gap: Space.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: Space.sm,
  },
});
