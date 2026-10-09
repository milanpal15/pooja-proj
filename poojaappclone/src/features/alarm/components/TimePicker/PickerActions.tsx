import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

/** Ring-it-now, then Delete + Done. Hidden entirely by the add form. */
export function PickerActions({
  hi,
  onDone,
  onDelete,
  onPreview,
}: {
  hi: boolean;
  onDone?: () => void;
  /** Shown only for an existing reminder; the add form has nothing to delete. */
  onDelete?: () => void;
  /** Ring it now. Absent where reminders are notifications, not alarms. */
  onPreview?: () => void;
}) {
  const { c } = useTheme();

  return (
    <>
      {onPreview && (
        <Pressable
          accessibilityRole="button"
          onPress={onPreview}
          style={({ pressed }) => [
            styles.previewBtn,
            { borderColor: c.outlineVariant, opacity: pressed ? 0.6 : 1 },
          ]}>
          <Icon name="bell" size={15} color={c.goldInk} />
          <Type v="labelMd" tone="goldInk">
            {hi ? 'अभी सुनें' : 'Ring it now'}
          </Type>
        </Pressable>
      )}

      <View style={styles.pickerActions}>
        {/* A Pressable rather than a Button: the kit has no destructive
            variant, and a delete that looks like every other action is
            how a reminder gets deleted by accident. */}
        {onDelete && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hi ? 'यह रिमाइंडर हटाएँ' : 'Delete this reminder'}
            onPress={onDelete}
            style={({ pressed }) => [
              styles.deleteBtn,
              { borderColor: c.error, opacity: pressed ? 0.6 : 1 },
            ]}>
            <Icon name="trash" size={15} color={c.error} />
            <Type v="labelMd" tone="error">
              {hi ? 'हटाएँ' : 'Delete'}
            </Type>
          </Pressable>
        )}
        <Button label={hi ? 'हो गया' : 'Done'} size="sm" style={{ flex: 1 }} onPress={onDone} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  pickerActions: { flexDirection: 'row', gap: Space.sm, alignItems: 'center' },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderWidth: 1.2,
    borderRadius: Radius.full,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderWidth: 1.2,
    borderRadius: Radius.full,
  },
});
