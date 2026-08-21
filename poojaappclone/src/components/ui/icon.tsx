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

import Svg, { Circle, G, Path } from 'react-native-svg';

import { useTheme } from '@/theme';

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
  | 'play'
  | 'pause'
  | 'globe'
  | 'logout'
  | 'sparkle'
  | 'lotus'
  | 'marigold'
  | 'shankh'
  | 'gift'
  | 'support';

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
      {render(name, filled, line, solid, tint, strokeWidth)}
    </Svg>
  );
}

type LineProps = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: string;
};

function render(
  name: IconName,
  filled: boolean,
  line: LineProps,
  solid: { fill: string; stroke: string },
  tint: string,
  sw: number,
) {
  const style = filled ? solid : line;

  switch (name) {
    /* ─────────────────────────────────────────── primary navigation ── */

    case 'home':
      // A gently arched roof rather than a plain triangle — closer to a
      // shikhara than a suburban house.
      return (
        <Path
          {...style}
          d="M3.4 11.2 L12 3.6 l8.6 7.6 M5.6 9.8 V19.4 a1.4 1.4 0 0 0 1.4 1.4 h3.2 v-4.6 a1.8 1.8 0 0 1 3.6 0 v4.6 H17 a1.4 1.4 0 0 0 1.4-1.4 V9.8"
        />
      );

    case 'diya':
      // Oil lamp: flame, then the shallow bowl. The flame is always solid so
      // the icon reads as lit even in the outline state — a diya that isn't
      // burning is the wrong metaphor for a pooja tab.
      return (
        <G>
          <Path
            fill={tint}
            stroke="none"
            d="M12 3.2 c1.7 2.1 2.5 3.5 2.5 4.7 a2.5 2.5 0 0 1-5 0 c0-1.2.8-2.6 2.5-4.7 Z"
          />
          <Path
            {...style}
            d="M3.6 13.6 h16.8 c0 3.7-3.8 5.6-8.4 5.6 s-8.4-1.9-8.4-5.6 Z"
          />
          {!filled && <Path {...line} d="M12 10.6 v3" />}
        </G>
      );

    case 'temple':
      // Stepped gopuram with a kalash finial and a doorway.
      return (
        <G>
          <Path {...style} d="M8.2 20.8 V11.4 L12 8.2 l3.8 3.2 v9.4 Z" />
          <Path {...line} stroke={tint} d="M4.4 20.8 h15.2" />
          <Path {...line} stroke={tint} d="M12 8.2 V5.6" />
          <Path fill={tint} stroke="none" d="M12 2.6 l1.3 2.2 h-2.6 Z" />
          {!filled && (
            <Path {...line} d="M10.6 20.8 v-3.9 a1.4 1.4 0 0 1 2.8 0 v3.9" />
          )}
        </G>
      );

    case 'music':
      return (
        <G>
          <Circle cx={7} cy={17.4} r={2.6} {...(filled ? solid : line)} />
          <Circle cx={17} cy={15.4} r={2.6} {...(filled ? solid : line)} />
          <Path {...line} stroke={tint} d="M9.6 17.4 V6 l10-2 v11.4" />
        </G>
      );

    case 'person':
      return (
        <G>
          <Circle cx={12} cy={8.2} r={3.6} {...(filled ? solid : line)} />
          <Path {...style} d="M4.8 20.6 a7.2 7.2 0 0 1 14.4 0 Z" />
        </G>
      );

    /* ──────────────────────────────────────────────────────── utility ── */

    case 'back':
      return <Path {...line} d="M15.2 4.8 L8 12 l7.2 7.2" />;
    case 'forward':
      return <Path {...line} d="M8.8 4.8 L16 12 l-7.2 7.2" />;
    case 'close':
      return <Path {...line} d="M6.2 6.2 l11.6 11.6 M17.8 6.2 L6.2 17.8" />;
    case 'check':
      return <Path {...line} d="M4.8 12.4 l4.8 4.8 L19.2 7.2" />;

    case 'bell':
      return (
        <G>
          <Path
            {...line}
            d="M12 3 a5.8 5.8 0 0 0-5.8 5.8 c0 4.5-1.9 5.9-1.9 5.9 h15.4 s-1.9-1.4-1.9-5.9 A5.8 5.8 0 0 0 12 3 Z"
          />
          <Path {...line} d="M10 18 a2.2 2.2 0 0 0 4 0" />
        </G>
      );

    case 'settings':
      return (
        <G>
          <Path
            {...line}
            d="M19.3 13.1 a7.6 7.6 0 0 0 0-2.2 l2-1.5 -2-3.4 -2.3 1 a7.6 7.6 0 0 0-1.9-1.1 L14.8 3.3 h-3.9 l-.3 2.6 a7.6 7.6 0 0 0-1.9 1.1 l-2.3-1 -2 3.4 2 1.5 a7.6 7.6 0 0 0 0 2.2 l-2 1.5 2 3.4 2.3-1 a7.6 7.6 0 0 0 1.9 1.1 l.3 2.6 h3.9 l.3-2.6 a7.6 7.6 0 0 0 1.9-1.1 l2.3 1 2-3.4 Z"
          />
          <Circle cx={12} cy={12} r={2.7} {...line} />
        </G>
      );

    case 'search':
      return (
        <G>
          <Circle cx={11} cy={11} r={6.4} {...line} />
          <Path {...line} d="M15.8 15.8 L20.6 20.6" />
        </G>
      );

    case 'calendar':
      return (
        <G>
          <Path {...line} d="M4.6 6.6 h14.8 a1.6 1.6 0 0 1 1.6 1.6 V19 a1.6 1.6 0 0 1-1.6 1.6 H4.6 A1.6 1.6 0 0 1 3 19 V8.2 a1.6 1.6 0 0 1 1.6-1.6 Z" />
          <Path {...line} d="M3 10.6 h18 M8.2 3.4 v4 M15.8 3.4 v4" />
        </G>
      );

    case 'mapPin':
      return (
        <G>
          <Path {...line} d="M12 21.4 s6.9-6.1 6.9-11 a6.9 6.9 0 1 0-13.8 0 c0 4.9 6.9 11 6.9 11 Z" />
          <Circle cx={12} cy={10.4} r={2.5} {...line} />
        </G>
      );

    case 'star':
      return (
        <Path
          {...(filled ? solid : line)}
          d="M12 3.4 l2.7 5.5 6 .9 -4.35 4.25 1.03 6 L12 17.25 l-5.38 2.8 1.03-6 L3.3 9.8 l6-.9 Z"
        />
      );

    case 'heart':
      return (
        <Path
          {...(filled ? solid : line)}
          d="M12 20.4 C6.9 15.7 4 13.1 4 9.8 A4.9 4.9 0 0 1 8.9 4.9 c1.8 0 3.4.9 4.4 2.3 h-2.6 a5.6 5.6 0 0 1 4.4-2.3 A4.9 4.9 0 0 1 20 9.8 c0 3.3-2.9 5.9-8 10.6 Z"
        />
      );

    case 'share':
      return (
        <G>
          <Path {...line} d="M12 3.4 v11.2 M8.2 7.2 L12 3.4 l3.8 3.8" />
          <Path {...line} d="M5 13.8 v4.8 a2 2 0 0 0 2 2 h10 a2 2 0 0 0 2-2 v-4.8" />
        </G>
      );

    case 'plus':
      return <Path {...line} d="M12 5.4 v13.2 M5.4 12 h13.2" />;
    case 'minus':
      return <Path {...line} d="M5.4 12 h13.2" />;

    case 'play':
      return <Path fill={tint} stroke="none" d="M7.8 5 v14 L19.4 12 Z" />;
    case 'pause':
      return (
        <Path fill={tint} stroke="none" d="M8 5 h2.9 v14 H8 Z M13.1 5 H16 v14 h-2.9 Z" />
      );

    case 'globe':
      return (
        <G>
          <Circle cx={12} cy={12} r={8.6} {...line} />
          <Path {...line} d="M3.4 12 h17.2" />
          <Path {...line} d="M12 3.4 a12.4 12.4 0 0 1 0 17.2 a12.4 12.4 0 0 1 0-17.2" />
        </G>
      );

    case 'logout':
      return (
        <G>
          <Path {...line} d="M14.6 8 V6.2 a2 2 0 0 0-2-2 H6 a2 2 0 0 0-2 2 v11.6 a2 2 0 0 0 2 2 h6.6 a2 2 0 0 0 2-2 V16" />
          <Path {...line} d="M10.4 12 h10.2 M17.4 8.8 L20.6 12 l-3.2 3.2" />
        </G>
      );

    case 'support':
      return (
        <G>
          <Path {...line} d="M4.4 15.4 v-3.6 a7.6 7.6 0 0 1 15.2 0 v3.6" />
          <Path {...line} d="M4.4 13.6 h1.8 a1.4 1.4 0 0 1 1.4 1.4 v2.4 a1.4 1.4 0 0 1-1.4 1.4 H5.8 a1.4 1.4 0 0 1-1.4-1.4 Z" />
          <Path {...line} d="M19.6 13.6 h-1.8 a1.4 1.4 0 0 0-1.4 1.4 v2.4 a1.4 1.4 0 0 0 1.4 1.4 h.4 a1.4 1.4 0 0 0 1.4-1.4 Z" />
        </G>
      );

    case 'gift':
      return (
        <G>
          <Path {...line} d="M3.6 10.4 h16.8 v2.4 H3.6 Z M5.2 12.8 V19 a1.6 1.6 0 0 0 1.6 1.6 h10.4 A1.6 1.6 0 0 0 18.8 19 v-6.2" />
          <Path {...line} d="M12 10.4 v10.2" />
          <Path {...line} d="M12 10.4 S10.6 6 8.4 6 a2.2 2.2 0 0 0 0 4.4 M12 10.4 S13.4 6 15.6 6 a2.2 2.2 0 0 1 0 4.4" />
        </G>
      );

    /* ───────────────────────────────────── devotional ornament forms ── */

    case 'sparkle':
      return (
        <Path
          fill={tint}
          stroke="none"
          d="M12 2.6 l1.75 5.85 5.85 1.75 -5.85 1.75 L12 17.8 l-1.75-5.85 -5.85-1.75 5.85-1.75 Z"
        />
      );

    case 'lotus':
      // Five petals around a centre, drawn once and rotated. Used for the
      // meditation category and the journal's "spiritual notes" marker.
      return (
        <G>
          {[-56, -28, 0, 28, 56].map((deg) => (
            <Path
              key={deg}
              {...(filled ? solid : line)}
              transform={`rotate(${deg} 12 17.4)`}
              d="M12 17.4 c-1.9-2.1-2.9-4-2.9-5.7 A2.9 2.9 0 0 1 12 8.8 a2.9 2.9 0 0 1 2.9 2.9 c0 1.7-1 3.6-2.9 5.7 Z"
            />
          ))}
        </G>
      );

    case 'marigold':
      // Eight petals ringed around a darker centre — the same construction as
      // the falling marigolds in the aarti scene, so they read as one family.
      return (
        <G>
          {Array.from({ length: 8 }, (_, i) => (
            <Circle
              key={i}
              cx={12 + 5.6 * Math.cos((i * Math.PI) / 4)}
              cy={12 + 5.6 * Math.sin((i * Math.PI) / 4)}
              r={3.1}
              fill={tint}
              opacity={0.9}
            />
          ))}
          <Circle cx={12} cy={12} r={3.3} fill={tint} />
        </G>
      );

    case 'shankh':
      // Conch: a spiral body with the flared lip at the lower left.
      return (
        <G>
          <Path
            {...line}
            d="M16.6 4.4 c2.6 2 3.4 5.4 2 8.6 -1.3 3.1-4.3 5.2-7.7 5.4 l-4.5 1.6 1.4-4.2 c-1.6-2.6-1.3-6 .8-8.2 2.2-2.4 5.6-3.1 8-1.2 Z"
          />
          <Path {...line} d="M14.4 7.6 c1.3 1.4 1.4 3.6.2 5.1 -1.1 1.4-3 1.9-4.6 1.2" />
        </G>
      );

    default:
      return null;
  }
}
