/**
 * `<Type>` — the only text component screens should use.
 *
 * It exists for one reason the plain `<Text>` can't handle: this app mixes
 * scripts inside a single screen, and often inside a single line ("Kashi
 * Vishwanath · काशी विश्वनाथ"). Setting one `fontFamily` globally would drop
 * every Devanagari string to the platform default. `<Type>` inspects the
 * string it is given and resolves the matching face at the same weight, so
 * both scripts sit at one optical weight.
 *
 *   <Type v="headlineLg">Live Darshan</Type>
 *   <Type v="mantra" tone="goldInk">ॐ नमः शिवाय</Type>
 *   <Type v="bodySm" tone="onSurfaceVariant">Varanasi, Uttar Pradesh</Type>
 */

import { Text, type TextProps, type TextStyle } from 'react-native';

import { type ColorRoles, tabularNums, type TypeVariant, typeStyle, useTheme } from '@/theme';

/** Any colour role that is meaningful for text. */
export type Tone = Extract<
  keyof ColorRoles,
  | 'onSurface'
  | 'onSurfaceVariant'
  | 'onSurfaceFaint'
  | 'primary'
  | 'onPrimary'
  | 'onPrimaryContainer'
  | 'accent'
  | 'onAccent'
  | 'onAccentContainer'
  | 'goldInk'
  | 'error'
  | 'success'
  | 'live'
>;

export type TypeComponentProps = TextProps & {
  /** Type scale step. */
  v?: TypeVariant;
  /** Colour role. Defaults to the surface's primary ink. */
  tone?: Tone;
  /** Override the resolved colour with a literal (rare — prefer `tone`). */
  color?: string;
  center?: boolean;
  /** Fixed-width figures, for amounts and counters in columns. */
  numeric?: boolean;
};

export function Type({
  v = 'bodyMd',
  tone = 'onSurface',
  color,
  center,
  numeric,
  style,
  children,
  ...rest
}: TypeComponentProps) {
  const { c } = useTheme();

  // The resolver needs the actual string. Children are usually a string or an
  // array of string fragments; anything else falls back to the Latin face,
  // which is correct for numbers and icons.
  const text = flatten(children);

  const resolved: TextStyle = {
    ...typeStyle(v, text),
    color: color ?? c[tone],
    ...(center ? { textAlign: 'center' } : null),
    ...(numeric ? tabularNums : null),
  };

  return (
    <Text style={[resolved, style]} {...rest}>
      {children}
    </Text>
  );
}

function flatten(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatten).join('');
  return '';
}
