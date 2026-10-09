import { Button, Field, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';

import { AuthStack } from './AuthStack';

export function PhoneStep({
  phone,
  onChangePhone,
  valid,
  error,
  busy,
  onSend,
  onBack,
}: {
  phone: string;
  /** Receives raw text — typed, pasted or autofilled — and normalises it. */
  onChangePhone: (raw: string) => void;
  valid: boolean;
  error: string;
  busy: boolean;
  onSend: () => void;
  onBack: () => void;
}) {
  const { t } = useLanguage();
  return (
    <AuthStack title={t('entry_mobile_title')} onBack={onBack}>
      <Field
        label={t('ph_phone')}
        icon="person"
        value={phone}
        onChangeText={onChangePhone}
        /*
         * Android autofill can write straight into the native view
         * without `onChangeText` firing, which left a number
         * sitting in the box while React still thought it empty —
         * so Send OTP stayed disabled on a field that visibly had
         * a number in it. `onChange` catches the autofill write,
         * and declaring `autoComplete` lets the platform target
         * the field properly in the first place.
         */
        onChange={(e) => onChangePhone(e.nativeEvent.text)}
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder="9876543210"
        keyboardType="number-pad"
        autoCapitalize="none"
        error={error || undefined}
        autoFocus
      />
      <Type v="bodySm" tone="onSurfaceFaint" center>
        {t('otp_sms_note')}
      </Type>
      <Button
        label={t('send_otp')}
        size="lg"
        block
        loading={busy}
        disabled={!valid || busy}
        onPress={onSend}
      />
    </AuthStack>
  );
}
