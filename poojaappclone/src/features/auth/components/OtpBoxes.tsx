import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

import { OTP_LEN } from '../constants';

/**
 * Six boxes driven by one offscreen input — the platform keyboard and
 * autofill both behave far better with a single field than with six that
 * hand focus to each other.
 */
export function OtpBoxes({
  value,
  onChange,
  inputRef,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<TextInput | null>;
  invalid: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Enter the verification code"
      onPress={() => inputRef.current?.focus()}
      style={styles.otpRow}>
      {Array.from({ length: OTP_LEN }, (_, i) => {
        const filled = i < value.length;
        const cursor = i === value.length;
        return (
          <View
            key={i}
            style={[
              styles.otpBox,
              {
                backgroundColor: c.containerLowest,
                borderColor: invalid ? c.error : cursor ? c.gold : c.outlineVariant,
              },
            ]}>
            <Type v="headlineMd" numeric>
              {filled ? value[i] : ''}
            </Type>
          </View>
        );
      })}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, OTP_LEN))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LEN}
        autoFocus
        // Offscreen rather than opacity:0 — a zero-opacity input still steals
        // taps from the boxes on Android.
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Six boxes have to be narrower than the old four to still fit a 360dp screen.
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: Space.xs },
  otpBox: {
    width: 46,
    height: 60,
    borderRadius: Radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999 },
});
