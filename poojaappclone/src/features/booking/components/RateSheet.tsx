import { useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Sheet, Stars, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { reviewBooking } from '@/lib/api';
import { Space } from '@/theme';

/**
 * 1-5 stars + optional text. Errors stay inside the sheet: it is a Modal, so
 * the app's toasts would draw behind it.
 */
export function RateSheet({
  bookingId,
  onClose,
  onDone,
}: {
  /** Set while open. */
  bookingId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <Sheet visible={bookingId != null} onClose={onClose}>
      {/* Mounted only while open, so rating and text reset each time. */}
      {bookingId != null && <Body bookingId={bookingId} onDone={onDone} />}
    </Sheet>
  );
}

function Body({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const { t } = useLanguage();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    if (rating < 1 || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await reviewBooking(bookingId, rating, text);
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: Space.md }}>
      <Type v="titleLg" tone="goldInk" center>
        {t('ps_rate_title')}
      </Type>
      <View style={{ alignItems: 'center' }}>
        <Stars value={rating} onChange={setRating} size={36} />
      </View>
      <Field
        value={text}
        onChangeText={setText}
        placeholder={t('ps_rate_hint')}
        accessibilityLabel={t('ps_rate_hint')}
        multilineRows={3}
        maxLength={500}
      />
      {failed && (
        <Type v="labelMd" tone="error" center accessibilityLiveRegion="polite">
          {t('ps_rate_failed')}
        </Type>
      )}
      <Button label={t('ps_rate_submit')} block loading={busy} disabled={rating < 1 || busy} onPress={submit} />
    </View>
  );
}
