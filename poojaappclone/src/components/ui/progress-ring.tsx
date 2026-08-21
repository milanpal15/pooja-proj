/**
 * `ProgressRing` — the japa counter on the Journal screen, and any circular
 * progress in the app.
 *
 * DESIGN.md asks for a "Burning Wick" metaphor: "as the bar fills, the
 * trailing end has a small flame or glow effect". The export drew a plain
 * bordered circle with no arc at all, so progress wasn't represented — the
 * ring looked identical at 0 and at 108.
 *
 * This draws the real arc, and puts a glowing ember at its leading end.
 */

import { View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

export type ProgressRingProps = {
  /** 0–1. Clamped. */
  progress: number;
  size?: number;
  thickness?: number;
  /** Hide the ember at the leading end (for indeterminate or full states). */
  ember?: boolean;
  children?: React.ReactNode;
};

export function ProgressRing({
  progress,
  size = 240,
  thickness = 8,
  ember = true,
  children,
}: ProgressRingProps) {
  const { c } = useTheme();
  const p = Math.max(0, Math.min(1, progress));

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;

  // Leading end of the arc, measured from 12 o'clock clockwise.
  const angle = -Math.PI / 2 + p * 2 * Math.PI;
  const emberX = cx + r * Math.cos(angle);
  const emberY = cx + r * Math.sin(angle);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <RadialGradient id="ember" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={c.accent} stopOpacity={0.9} />
            <Stop offset="1" stopColor={c.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Track */}
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          stroke={c.outlineVariant}
          strokeWidth={thickness}
          fill="none"
        />

        {/* Arc — rotated so it starts at 12 o'clock rather than 3. */}
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          stroke={c.gold}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * p} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cx})`}
        />

        {/* The wick's glow, then its ember. Drawn only when there is an arc
            to lead — at zero there is nothing burning yet. */}
        {ember && p > 0.002 && (
          <>
            <Circle cx={emberX} cy={emberY} r={thickness * 2.2} fill="url(#ember)" />
            <Circle cx={emberX} cy={emberY} r={thickness * 0.62} fill={c.accent} />
          </>
        )}
      </Svg>
      {children}
    </View>
  );
}
