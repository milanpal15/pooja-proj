import { Pressable, type PressableProps, type StyleProp, View, type ViewStyle } from 'react-native';

import { Radius, Space, useTheme } from '@/theme';

import { Mandala } from '../mandala';

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
