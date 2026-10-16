import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Chip, Field, Sheet, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { RegistrationField } from '@/lib/api';

import { type AnswerError, cleanAnswers, fieldLabel, type JoinFailure, validateAnswers } from '../lib/registration';

/**
 * The registration form: one input per `registration.fields` entry (text / choice / number), labels
 * in the reader's language. Errors are drawn INSIDE the sheet — a Modal is its own window, so a toast
 * would land behind it. Nothing is sent until the form validates, and the sheet closes only when the
 * server has said yes.
 */
export function JoinSheet({
  visible,
  fields,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  fields: RegistrationField[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (answers: Record<string, string | number>) => Promise<JoinFailure | null>;
}) {
  const { t, lang } = useLanguage();
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, AnswerError | 'server'>>({});
  const [message, setMessage] = useState('');

  const set = (key: string, v: string) => {
    setRaw((r) => ({ ...r, [key]: v }));
    setErrors((e) => {
      if (!e[key]) return e;
      const { [key]: _drop, ...rest } = e;
      return rest;
    });
  };

  const submit = async () => {
    const v = validateAnswers(fields, raw);
    if (!v.ok) {
      setErrors(v.errors);
      setMessage('');
      return;
    }
    const failure = await onSubmit(cleanAnswers(fields, raw));
    if (!failure) {
      setMessage('');
      return;
    }
    setMessage(t(failure.key));
    if (failure.field) setErrors({ [failure.field]: 'server' });
  };

  const errText = (e: AnswerError | 'server' | undefined) =>
    e === 'required' ? t('ev_field_required') : e === 'number' ? t('ev_field_number') : e === 'choice' ? t('ev_field_choice') : e === 'server' ? t('ev_field_required') : undefined;

  return (
    <Sheet visible={visible} onClose={onClose} title={t('ev_join_title')}>
      <Type v="bodySm" tone="onSurfaceVariant">
        {t('ev_join_intro')}
      </Type>
      {fields.map((f) => {
        const label = `${fieldLabel(f, lang)}${f.required ? ' *' : ''}`;
        if (f.type === 'choice') {
          return (
            <View key={f.key} style={styles.group}>
              <Type v="labelMd" tone="onSurfaceVariant">
                {label}
              </Type>
              <View style={styles.chips}>
                {(f.options ?? []).map((o) => (
                  <Chip key={o} label={o} selected={raw[f.key] === o} onPress={() => set(f.key, raw[f.key] === o ? '' : o)} />
                ))}
              </View>
              {!!errors[f.key] && (
                <Type v="bodySm" tone="error">
                  {errText(errors[f.key])}
                </Type>
              )}
            </View>
          );
        }
        return (
          <Field
            key={f.key}
            label={label}
            value={raw[f.key] ?? ''}
            onChangeText={(v) => set(f.key, v)}
            keyboardType={f.type === 'number' ? 'numeric' : 'default'}
            error={errText(errors[f.key])}
            maxLength={200}
          />
        );
      })}
      {!!message && (
        <Type v="bodyMd" tone="error" accessibilityLiveRegion="polite">
          {message}
        </Type>
      )}
      <Button label={t('ev_join_submit')} loading={busy} disabled={busy} block onPress={submit} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
