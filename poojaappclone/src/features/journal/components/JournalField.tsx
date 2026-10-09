import { StyleSheet, View } from 'react-native';

import { Field, Icon, type IconName, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

/** A titled free-text box: gratitude, or spiritual notes. */
export function JournalField({
  title,
  icon,
  value,
  onChangeText,
  placeholder,
  multilineRows,
}: {
  title: string;
  icon: IconName;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  multilineRows?: number;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Type v="titleLg">{title}</Type>
        <Icon name={icon} size={22} color={c.gold} />
      </View>
      <Field
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multilineRows={multilineRows}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Space.sm },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
