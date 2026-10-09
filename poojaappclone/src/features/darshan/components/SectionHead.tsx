import { Pressable, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { Space } from '@/theme';

/** Section title with an optional trailing text action. */
export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.row}>
      <Type v="titleMd">{title}</Type>
      {!!action && !!onAction && (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10}>
          <Type v="labelMd" tone="primary">
            {action}
          </Type>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: Space.margin },
});
