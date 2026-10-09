import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { OTP_LEN } from '../constants';
import { AuthStack } from './AuthStack';
import { OtpBoxes } from './OtpBoxes';

export function OtpStep({
  phone,
  otp,
  onChangeOtp,
  otpRef,
  error,
  resendIn,
  busy,
  onResend,
  onVerify,
  onBack,
}: {
  phone: string;
  otp: string;
  onChangeOtp: (v: string) => void;
  /** Owned by the parent so it can focus the offscreen input. */
  otpRef: React.RefObject<TextInput | null>;
  error: string;
  resendIn: number;
  busy: boolean;
  onResend: () => void;
  onVerify: () => void;
  onBack: () => void;
}) {
  const { t } = useLanguage();
  return (
    <AuthStack title={t('otp_verification')} onBack={onBack}>
      <Type v="bodyMd" tone="onSurfaceVariant" center>
        {t('otp_sub_to')} <Type v="titleMd">+91 {phone}</Type>
      </Type>

      <OtpBoxes value={otp} onChange={onChangeOtp} inputRef={otpRef} invalid={!!error} />

      {!!error && (
        <Type v="labelMd" tone="error" center>
          {error}
        </Type>
      )}

      <View style={styles.resendRow}>
        <Type v="bodySm" tone="onSurfaceFaint">
          {resendIn > 0
            ? `${t('resend_in')} 00:${String(resendIn).padStart(2, '0')}`
            : t('no_code')}
        </Type>
        <Button
          label={t('resend')}
          variant="ghost"
          size="sm"
          disabled={resendIn > 0 || busy}
          onPress={onResend}
        />
      </View>

      <Button
        label={t('verify_proceed')}
        size="lg"
        block
        loading={busy}
        disabled={otp.length !== OTP_LEN || busy}
        onPress={onVerify}
      />
    </AuthStack>
  );
}

const styles = StyleSheet.create({
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
});
