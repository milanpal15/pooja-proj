import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Space, useTheme } from '@/theme';

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
 * are deliberately narrow — five fixed tones, chosen once here — rather than
 * per-screen literals, so a sixth kind of shelf has to be a decision rather
 * than an accident.
 *
 * The band meets the body in a scalloped edge: a strip of the tone's darker
 * shade with white semicircles rising into it. It is drawn (react-native-svg)
 * rather than clipped, and the wrapper carries no `overflow: 'hidden'` — that
 * plus a large corner radius clips absolutely positioned children on Android.
 * Rounded corners are put on the band and the body separately instead.
 */

export type BandTone = 'gold' | 'purple' | 'crimson' | 'forest' | 'maroon';

const TONES: Record<BandTone, readonly [string, string]> = {
  gold: ['#C08A1E', '#A97213'],
  purple: ['#563274', '#432459'],
  crimson: ['#C2185B', '#A0134B'],
  forest: ['#0F6B4A', '#0A5238'],
  maroon: ['#7A1C2A', '#5E1420'],
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

      <Scallop color={TONES[tone][1]} bump={c.containerLowest} />

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

const SCALLOP_W = 16;
const SCALLOP_H = 8;

/** A row of semicircles (radius 7, 16px pitch) in the body colour, on a strip of the band's shade. */
function Scallop({ color, bump }: { color: string; bump: string }) {
  const [width, setWidth] = useState(0);
  const count = Math.ceil(width / SCALLOP_W);
  // One path for all bumps: each is an arc from (x+1, 8) over to (x+15, 8).
  let d = '';
  for (let i = 0; i < count; i++) d += `M${i * SCALLOP_W + 1} ${SCALLOP_H}a7 7 0 0 1 14 0Z`;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: SCALLOP_H, backgroundColor: color }}>
      {width > 0 && (
        <Svg width={width} height={SCALLOP_H}>
          <Path d={d} fill={bump} />
        </Svg>
      )}
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
  wrap: {},
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    height: 50,
    paddingHorizontal: Space.sm,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  bandTitle: { flexShrink: 1, textAlign: 'center' },
  flourish: { flex: 1, maxWidth: 80 },
  body: {
    padding: 14,
    gap: Space.sm,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: Space.sm,
  },
});
