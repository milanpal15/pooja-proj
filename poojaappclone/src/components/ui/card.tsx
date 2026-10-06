/**
 * Containers and list furniture: `Card`, `ArchImage`, `SectionHeader`,
 * `ListRow`, `Divider`, `Chip`, `Badge`.
 *
 * `ArchImage` is the one worth calling out. DESIGN.md asks for a "Temple Arch"
 * clip on featured media — "the top corners have a much larger radius or a
 * specific ogive curve to mimic traditional Indian architecture" — and it is
 * the single most characteristic shape in the system. The export never
 * actually drew it; every image came back as a plain rounded rectangle. This
 * implements it: a large top radius against a small bottom one, which is the
 * closest a platform view can get to an ogive without masking every image
 * through SVG.
 */

import {
  Image,
  type ImageSourcePropType,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { Radius, Space, useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Mandala } from './mandala';
import { Type } from './type';

/* ─────────────────────────────────────────────────────────────── card ── */

export type CardProps = {
  children: React.ReactNode;
  /**
   * `plain`   white container, hairline border — the default list card
   * `ornate`  gold hairline + mandala watermark — featured content only
   * `sunken`  tonal container, no border — settings groups, summaries
   * `glass`   frosted — sanctum surfaces only
   */
  variant?: 'plain' | 'ornate' | 'sunken' | 'glass';
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: PressableProps['onPress'];
  accessibilityLabel?: string;
};

export function Card({
  children,
  variant = 'plain',
  padded = true,
  style,
  onPress,
  accessibilityLabel,
}: CardProps) {
  const { c, elevation } = useTheme();

  const skin: ViewStyle =
    variant === 'ornate'
      ? { backgroundColor: c.containerLowest, borderWidth: 1, borderColor: c.goldHairline }
      : variant === 'sunken'
        ? { backgroundColor: c.containerLow }
        : variant === 'glass'
          ? { backgroundColor: c.glass, borderWidth: 1, borderColor: c.glassBorder }
          : { backgroundColor: c.containerLowest, borderWidth: 1, borderColor: c.outlineVariant };

  // One element, not a wrapper around one. An earlier version nested the card
  // inside a Pressable and left the caller's `style` on the inner view — so
  // every layout rule a caller passed (`width: '47%'`, `flex: 1`) applied to
  // a child of a wrapper that had already collapsed to its content width.
  // Tappable grids and full-width cards silently overflowed their row.
  const base: ViewStyle[] = [
    {
      borderRadius: Radius.lg,
      overflow: 'hidden',
      padding: padded ? Space.cardPadding : 0,
    },
    skin,
  ];
  if (variant !== 'sunken' && variant !== 'glass') {
    base.push(elevation.low as ViewStyle, { shadowColor: c.glowTint });
  }

  const inner = (
    <>
      {variant === 'ornate' && (
        <Mandala
          size={200}
          opacity={0.05}
          style={{ position: 'absolute', top: -54, right: -54 }}
        />
      )}
      {children}
    </>
  );

  if (!onPress) return <View style={[...base, style]}>{inner}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [...base, style, pressed && { opacity: 0.9 }]}>
      {inner}
    </Pressable>
  );
}

/* ────────────────────────────────────────────────────────── archimage ── */

/**
 * Featured media under a temple arch. `height` is required so the arch radius
 * can be derived from it — an arch that doesn't scale with its image reads as
 * a rounding mistake rather than architecture.
 */
export function ArchImage({
  source,
  height,
  style,
  children,
  /**
   * `cover` for photographs; `contain` for the transparent deity cutouts,
   * which crop to an empty region under `cover` and render as a blank box.
   */
  fit = 'cover',
}: {
  /**
   * Optional: artwork comes from the dashboard, and a deity may not have
   * any yet. The arch, its backdrop and any children still render — an
   * empty frame is the honest answer, and better than a crash.
   */
  source?: ImageSourcePropType;
  height: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  fit?: 'cover' | 'contain';
}) {
  const arch = Math.min(Radius.arch, height * 0.42);
  return (
    <View
      style={[
        {
          height,
          borderTopLeftRadius: arch,
          borderTopRightRadius: arch,
          borderBottomLeftRadius: Radius.md,
          borderBottomRightRadius: Radius.md,
          overflow: 'hidden',
        },
        style,
      ]}>
      {/*
        Sized with width/height rather than an absolute Fill. On Android an
        absolutely-positioned child of a view that combines `overflow:'hidden'`
        with a large corner radius gets clipped away entirely — the arch drew
        its background and the label, and the deity never appeared. A
        normally-laid-out child is clipped correctly.
      */}
      {source && <Image source={source} resizeMode={fit} style={styles.archImage} />}
      {children}
    </View>
  );
}

/* ────────────────────────────────────────────────────── section header ── */

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Type v="titleLg">{title}</Type>
      {!!action && (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Type v="labelMd" tone="primary">
            {action}
          </Type>
        </Pressable>
      )}
    </View>
  );
}

/* ──────────────────────────────────────────────────────────── listrow ── */

/** A settings / profile row: tinted icon medallion, title, subtitle, chevron. */
export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  last = false,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  last?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: c.outlineVariant },
        pressed && onPress ? { backgroundColor: c.container } : null,
      ]}>
      {!!icon && (
        <View style={[styles.medallion, { backgroundColor: c.accentContainer }]}>
          <Icon name={icon} size={20} color={c.primary} />
        </View>
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <Type v="titleMd" tone="goldInk">
          {title}
        </Type>
        {!!subtitle && (
          <Type v="bodySm" tone="onSurfaceVariant">
            {subtitle}
          </Type>
        )}
      </View>
      {right ?? (onPress ? <Icon name="forward" size={18} color={c.onSurfaceFaint} /> : null)}
    </Pressable>
  );
}

/* ──────────────────────────────────────────────────────────── divider ── */

export function Divider({ inset = 0, gold = false }: { inset?: number; gold?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth * 2,
        marginLeft: inset,
        backgroundColor: gold ? c.goldHairline : c.outlineVariant,
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────── chip ── */

/**
 * Selection chips — the amount presets on e-Chadhava, filters on Temples.
 * The export selected these with a navy fill that exists nowhere else in the
 * system; selection is kumkum here, matching every other "active" state.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.primary : c.containerLowest,
          borderColor: selected ? c.primary : c.goldHairline,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {!!icon && (
        <Icon name={icon} size={15} color={selected ? c.onPrimary : c.goldInk} strokeWidth={2} />
      )}
      <Type v="labelMd" color={selected ? c.onPrimary : c.goldInk}>
        {label}
      </Type>
    </Pressable>
  );
}

/* ────────────────────────────────────────────────────────────── badge ── */

export function Badge({
  label,
  tone = 'accent',
}: {
  label: string;
  tone?: 'accent' | 'primary' | 'live' | 'success';
}) {
  const { c } = useTheme();
  const bg =
    tone === 'live' ? c.live
    : tone === 'primary' ? c.primary
    : tone === 'success' ? c.success
    : c.accent;

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Type v="labelSm" color="#FFFFFF">
        {label}
      </Type>
    </View>
  );
}

const styles = StyleSheet.create({
  archImage: { width: '100%', height: '100%' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: 14,
    paddingHorizontal: Space.cardPadding,
  },
  medallion: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: Radius.full,
    borderWidth: 1.2,
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
});
