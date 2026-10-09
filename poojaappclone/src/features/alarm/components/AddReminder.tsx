import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Field, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

import type { AddDraft } from '../types';

import { TimePicker } from './TimePicker';

/** Below the list: the add form while open, the Add button (and Restore) otherwise. */
export function AddReminder({
  hi,
  adding,
  hasRemovedDefaults,
  onChange,
  onCancel,
  onSubmit,
  onOpen,
  onRestore,
}: {
  hi: boolean;
  adding: AddDraft | null;
  hasRemovedDefaults: boolean;
  onChange: (update: (a: AddDraft | null) => AddDraft | null) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onOpen: () => void;
  onRestore: () => void;
}) {
  const { c } = useTheme();

  return (
    <>
      <View style={[styles.rule, { backgroundColor: c.outlineVariant }]} />

      {adding ? (
        <View style={styles.addForm}>
          <Field
            label={hi ? 'रिमाइंडर का नाम' : 'Reminder name'}
            icon="bell"
            value={adding.title}
            onChangeText={(title) => onChange((a) => (a ? { ...a, title } : a))}
            placeholder={hi ? 'जैसे, तुलसी को जल' : 'e.g. Water the tulsi'}
            maxLength={40}
            /* Deliberately NOT autoFocus: the keyboard would cover the
               time picker directly below, which is half of this form. */
            returnKeyType="done"
          />
          <TimePicker
            hour={adding.hour}
            minute={adding.minute}
            onChange={(hour, minute) => onChange((a) => (a ? { ...a, hour, minute } : a))}
            hideDone
          />
          <View style={styles.addActions}>
            <Button
              label={hi ? 'रहने दें' : 'Cancel'}
              variant="ghost"
              size="sm"
              style={{ flex: 1 }}
              onPress={onCancel}
            />
            <Button
              label={hi ? 'जोड़ें' : 'Add reminder'}
              size="sm"
              style={{ flex: 1 }}
              onPress={onSubmit}
            />
          </View>
        </View>
      ) : (
        <View style={styles.addRow}>
          <Button
            label={hi ? 'नया रिमाइंडर' : 'Add a reminder'}
            variant="outline"
            size="sm"
            icon="plus"
            block
            onPress={onOpen}
          />
          {hasRemovedDefaults && (
            <Pressable
              accessibilityRole="button"
              onPress={onRestore}
              style={({ pressed }) => [styles.restore, { opacity: pressed ? 0.6 : 1 }]}>
              <Type v="labelMd" tone="primary">
                {hi ? 'दैनिक आरती वापस लाएँ' : 'Restore the daily cycle'}
              </Type>
            </Pressable>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  rule: { height: StyleSheet.hairlineWidth * 2 },
  addRow: { gap: Space.sm, paddingTop: Space.sm },
  addForm: { gap: Space.sm, paddingTop: Space.sm },
  addActions: { flexDirection: 'row', gap: Space.sm },
  restore: { alignSelf: 'center', paddingVertical: 6 },
});
