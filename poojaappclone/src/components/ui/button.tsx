/**
 * Buttons.
 *
 * The export drew at least six different button treatments across twelve
 * screens — a saffron gradient pill, a flat orange pill, a solid red pill, a
 * gold gradient pill, a navy chip and an outlined pill — with no rule about
 * which meant what. These five variants cover every one of them, with the
 * rule made explicit:
 *
 *   primary    the sunlight gradient. ONE per screen. Pay, Verify, Donate.
 *   secondary  solid kumkum. A real action that isn't *the* action —
 *              "Navigate" beside "Book Pooja".
 *   outline    gold hairline. Reversible or low-stakes — "Logout", "Skip".
 *   ghost      text only. Tertiary — "Resend", "Change number".
 *   glass      frosted. Only on the sanctum surface, where a filled button
 *              would punch a hole in the immersive backdrop.
 *
 * Every variant is pill-shaped, per the system's "fluidity and friendliness"
 * rule, and every one meets a 44pt minimum touch target even at size `sm`.
 */

import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import { Radius, useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Type } from './type';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'glass';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  /** Stretch to the container's width. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
};

const SIZES = {
  sm: { height: 44, padX: 16, gap: 6, icon: 16, v: 'labelMd' as const },
  md: { height: 52, padX: 22, gap: 8, icon: 19, v: 'labelLg' as const },
  lg: { height: 58, padX: 26, gap: 10, icon: 21, v: 'labelLg' as const },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  block = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { c, elevation } = useTheme();
  const s = SIZES[size];
  const off = disabled || loading;

  // Ink colour per variant, so the label and icon always agree.
  const ink =
    variant === 'primary' ? c.onAccent
    : variant === 'secondary' ? c.onPrimary
    : variant === 'outline' ? c.goldInk
    : variant === 'glass' ? c.onSurface
    : c.primary;

  const shell: ViewStyle = {
    height: s.height,
    paddingHorizontal: s.padX,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    // Always fill the Pressable. The Pressable decides how wide it is (from
    // `block`, or a caller's `flex: 1`); the shell just fills whatever it got.
    alignSelf: 'stretch',
  };

  const body = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={ink} />
      ) : (
        icon && <Icon name={icon} size={s.icon} color={ink} strokeWidth={2} />
      )}
      <Type v={s.v} color={ink} numberOfLines={1}>
        {label}
      </Type>
      {iconRight && !loading && (
        <Icon name={iconRight} size={s.icon} color={ink} strokeWidth={2} />
      )}
    </>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: loading }}
      disabled={off}
      style={({ pressed }) => [
        { alignSelf: block ? 'stretch' : 'flex-start' },
        { opacity: off ? 0.45 : pressed ? 0.88 : 1 },
        // The press "glow" the system asks for, done as a scale nudge rather
        // than an inner shadow, which RN can't render.
        pressed && !off ? { transform: [{ scale: 0.985 }] } : null,
        style,
      ]}
      {...rest}>
      {variant === 'primary' ? (
        <LinearGradient
          colors={c.sunlight as unknown as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[shell, elevation.mid, { shadowColor: c.glowTint }]}>
          {body}
        </LinearGradient>
      ) : (
        <View
          style={[
            shell,
            variant === 'secondary' && [{ backgroundColor: c.primary }, elevation.low],
            variant === 'outline' && {
              backgroundColor: 'transparent',
              borderWidth: 1.4,
              borderColor: c.goldHairline,
            },
            variant === 'glass' && {
              backgroundColor: c.glass,
              borderWidth: 1,
              borderColor: c.glassBorder,
            },
          ]}>
          {body}
        </View>
      )}
    </Pressable>
  );
}

/**
 * A circular icon-only control. The ritual rail on the pooja screen (Aarti,
 * Pushpa Varsha, Shankh Naad) and the app bar's back/settings buttons.
 */
export function IconButton({
  name,
  label,
  size = 44,
  variant = 'ghost',
  color,
  style,
  ...rest
}: Omit<PressableProps, 'style'> & {
  name: IconName;
  /** Required — icon-only controls need an accessible name. */
  label: string;
  size?: number;
  variant?: 'ghost' | 'glass' | 'solid';
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const tint = color ?? (variant === 'solid' ? c.onPrimary : c.onSurface);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: Radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        },
        variant === 'glass' && {
          backgroundColor: c.glass,
          borderWidth: 1,
          borderColor: c.glassBorder,
        },
        variant === 'solid' && { backgroundColor: c.primary },
        style,
      ]}
      {...rest}>
      <Icon name={name} size={Math.round(size * 0.5)} color={tint} />
    </Pressable>
  );
}
