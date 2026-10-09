/**
 * The Sacred Devotion icon set.
 *
 * Replaces the emoji the app was using for navigation and actions (🏠 🪔 🛕
 * 🎵 👤 ⚙️ ❤️). Emoji are the fastest way to ship an icon and the fastest way
 * to lose a design system: they render in the platform's colour and shape, so
 * the tab bar looked like Apple's on iOS and Google's on Android, and no
 * amount of theming could touch them.
 *
 * The set follows DESIGN.md's rule that utility icons are line-art while the
 * primary navigation icons are richer "devotional" forms — so the five tab
 * icons each have a `filled` variant used for the active state, and the
 * utility icons do not.
 *
 * Grid: 24×24. Strokes are 1.7 with round caps and joins, which holds up at
 * the 22–26px the tab bar and app bar actually render at.
 */

import Svg from 'react-native-svg';

import { useTheme } from '@/theme';

import { renderGlyph } from './icon-glyphs';

export type IconName =
  // primary navigation — have a filled variant
  | 'home'
  | 'diya'
  | 'temple'
  | 'music'
  | 'person'
  // utility — line art only
  | 'back'
  | 'forward'
  | 'close'
  | 'check'
  | 'bell'
  | 'settings'
  | 'search'
  | 'calendar'
  | 'mapPin'
  | 'star'
  | 'heart'
  | 'share'
  | 'plus'
  | 'minus'
  | 'trash'
  | 'play'
  | 'pause'
  | 'globe'
  | 'logout'
  | 'sparkle'
  | 'lotus'
  | 'marigold'
  | 'shankh'
  | 'gift'
  | 'support'
  | 'google'
  | 'bag'
  | 'chevronDown'
  | 'chevronRight'
  | 'arrowRight'
  | 'filter'
  | 'user'
  | 'clock'
  | 'moon';

export type IconProps = {
  name: IconName;
  size?: number;
  /** Defaults to the current surface's primary ink. */
  color?: string;
  /** Solid form — only the five navigation icons differ when filled. */
  filled?: boolean;
  strokeWidth?: number;
};

export function Icon({ name, size = 24, color, filled = false, strokeWidth = 1.7 }: IconProps) {
  const { c } = useTheme();
  const tint = color ?? c.onSurface;

  // Shared props for the two drawing styles.
  const line = {
    stroke: tint,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  const solid = { fill: tint, stroke: 'none' };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderGlyph(name, filled, line, solid, tint)}
    </Svg>
  );
}
