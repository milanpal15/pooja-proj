/**
 * The mandala watermark.
 *
 * DESIGN.md asks for "a faint Mandala watermark pattern in the background (5%
 * opacity)" on featured cards, and four of the twelve screens show one — but
 * the export delivered it as baked-in raster, so it couldn't re-tone, resize,
 * or respond to the surface it sat on.
 *
 * Drawn instead: three concentric petal rings generated from one petal path,
 * so it stays crisp at any size, takes its colour from the current surface,
 * and costs a few hundred bytes rather than a megabyte of PNG.
 */

import { useMemo } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { useTheme } from '@/theme';

export type MandalaProps = {
  size?: number;
  /** Defaults to the surface's ornament gold. */
  color?: string;
  /** DESIGN.md's watermark level is 0.05; ornamental use runs 0.12–0.3. */
  opacity?: number;
  /** Petals in the outer ring. Inner rings scale down from this. */
  petals?: number;
  style?: StyleProp<ViewStyle>;
  /** Draw only the top half — for header washes. */
  half?: boolean;
};

export function Mandala({
  size = 320,
  color,
  opacity = 0.05,
  petals = 16,
  style,
  half = false,
}: MandalaProps) {
  const { c } = useTheme();
  const tint = color ?? c.gold;

  // Three rings: outer petals, mid petals at half count, and an inner rosette.
  const rings = useMemo(
    () => [
      { count: petals, r: 46, len: 44, w: 1.1 },
      { count: Math.max(6, Math.round(petals / 2)), r: 27, len: 26, w: 1 },
      { count: Math.max(6, Math.round(petals / 2)), r: 14, len: 13, w: 0.9 },
    ],
    [petals],
  );

  return (
    <View
      // `pointerEvents` must be in STYLE, not a prop. As a prop it is ignored
      // under the new architecture on Android, and this view is absolutely
      // positioned over real controls — it was swallowing taps on the login
      // field, which sits inside the top mandala's box.
      pointerEvents="none"
      style={[
        { pointerEvents: 'none', width: size, height: half ? size / 2 : size, overflow: 'hidden' },
        style,
      ]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <G opacity={opacity}>
          {rings.map((ring, ri) =>
            Array.from({ length: ring.count }, (_, i) => (
              <Path
                key={`${ri}-${i}`}
                transform={`rotate(${(360 / ring.count) * i} 50 50)`}
                d={petal(ring.r, ring.len)}
                stroke={tint}
                strokeWidth={ring.w}
                fill="none"
                strokeLinecap="round"
              />
            )),
          )}
          <Circle cx={50} cy={50} r={6.5} stroke={tint} strokeWidth={1} fill="none" />
          <Circle cx={50} cy={50} r={2.4} fill={tint} />
          {/* Two hairline containment rings, as in traditional yantra layouts */}
          <Circle cx={50} cy={50} r={48.5} stroke={tint} strokeWidth={0.7} fill="none" />
          <Circle cx={50} cy={50} r={33} stroke={tint} strokeWidth={0.7} fill="none" />
        </G>
      </Svg>
    </View>
  );
}

/**
 * One lotus petal pointing up from the centre: two mirrored quadratic curves
 * meeting at a tip `len` units out, `r` units wide at the base.
 */
function petal(r: number, len: number): string {
  const halfW = r * 0.28;
  const tip = 50 - len;
  return `M50 ${50 - r * 0.18} C${50 - halfW} ${tip + len * 0.42}, ${50 - halfW * 0.55} ${tip}, 50 ${tip} C${50 + halfW * 0.55} ${tip}, ${50 + halfW} ${tip + len * 0.42}, 50 ${50 - r * 0.18} Z`;
}
