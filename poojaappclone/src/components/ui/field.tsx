/**
 * `Field` — the text input.
 *
 * DESIGN.md: "Minimalist with a bottom-border focus state in Gold,
 * accompanied by a small 'Glow' effect when active." The export drew four
 * different inputs across four screens — a boxed amount field, a plain
 * bordered one, an underlined one, and the OTP boxes — none of which had a
 * focus state at all.
 *
 * One input, with the gold focus ring the system asked for.
 */

import { useRef, useState } from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';

import { Radius, Space, typeStyle, useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Type } from './type';

export type FieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  /** Leading glyph — a rupee sign, a phone icon. */
  icon?: IconName;
  /** Leading adornment of any kind — the coin disc on an amount field. */
  left?: React.ReactNode;
  /** Trailing adornment. */
  right?: React.ReactNode;
  /** Error text; also turns the border red. */
  error?: string;
  /** Taller, top-aligned — the journal's reflection box. */
  multilineRows?: number;
  containerStyle?: StyleProp<ViewStyle>;
  /** Large centred figure, for the amount field. */
  amount?: boolean;
};

export function Field({
  label,
  icon,
  left,
  right,
  error,
  multilineRows,
  containerStyle,
  amount = false,
  onFocus,
  onBlur,
  ...rest
}: FieldProps) {
  const { c, elevation } = useTheme();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const borderColor = error ? c.error : focused ? c.gold : c.outlineVariant;

  // Derived from the props rather than named directly: RN 0.86 renamed these
  // payloads to FocusEvent / BlurEvent, and this stays correct either way.
  const handleFocus: TextInputProps['onFocus'] = (e) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur: TextInputProps['onBlur'] = (e) => {
    setFocused(false);
    onBlur?.(e);
  };

  return (
    <View style={[styles.wrap, containerStyle]}>
      {!!label && (
        <Type v="labelMd" tone="onSurfaceVariant">
          {label}
        </Type>
      )}

      {/* The box focuses the input rather than relying on the TextInput's own
          hit area. On device the input was not receiving taps at all —
          `mServedView` stayed null and no keyboard appeared — while buttons on
          the same screen worked. Routing focus explicitly fixes that, and also
          makes the field's padding tappable, which is what people expect. */}
      <Pressable
        accessibilityRole="none"
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.box,
          {
            backgroundColor: c.containerLowest,
            borderColor,
            minHeight: multilineRows ? 24 * multilineRows + 24 : 52,
            alignItems: multilineRows ? 'flex-start' : 'center',
          },
          // The "glow when active" — an ambient saffron cast, not a hard ring.
          focused && !error ? [elevation.low, { shadowColor: c.glowTint }] : null,
        ]}>
        {left}
        {!!icon && <Icon name={icon} size={18} color={c.onSurfaceFaint} />}
        <TextInput
          ref={inputRef}
          onFocus={handleFocus}
          onBlur={handleBlur}
          multiline={!!multilineRows}
          placeholderTextColor={c.onSurfaceFaint}
          selectionColor={c.primary}
          style={[
            styles.input,
            typeStyle(amount ? 'headlineMd' : 'bodyMd', rest.value),
            { color: c.onSurface },
            amount && { textAlign: 'center' },
            multilineRows ? { textAlignVertical: 'top', paddingTop: 2 } : null,
          ]}
          {...rest}
        />
        {right}
      </Pressable>

      {!!error && (
        <Type v="labelSm" tone="error">
          {error}
        </Type>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, alignSelf: 'stretch' },
  box: {
    flexDirection: 'row',
    gap: Space.sm,
    borderWidth: 1.4,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: 12,
  },
  input: { flex: 1, padding: 0, margin: 0 },
});
