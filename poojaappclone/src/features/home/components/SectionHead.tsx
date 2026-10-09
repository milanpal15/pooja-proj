import { Pressable, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';

/** A block title with an optional "See all"-style link on the right. */
export function SectionHead({ title, link, onLink }: { title: string; link?: string; onLink?: () => void }) {
  return (
    <View style={styles.row}>
      <Type v="titleMd" accessibilityRole="header">
        {title}
      </Type>
      {!!link && (
        <Pressable accessibilityRole="link" onPress={onLink} hitSlop={10}>
          <Type v="labelMd" tone="primary">
            {link}
          </Type>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 } });
