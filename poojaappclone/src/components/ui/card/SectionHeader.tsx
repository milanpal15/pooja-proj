import { Pressable, StyleSheet, View } from 'react-native';

import { Space } from '@/theme';

import { Type } from '../type';

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Type v="titleLg">{title}</Type>
      {!!action && (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Type v="labelMd" tone="primary">
            {action}
          </Type>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
});
