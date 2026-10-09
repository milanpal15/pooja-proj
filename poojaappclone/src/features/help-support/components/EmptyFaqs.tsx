import { StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

export function EmptyFaqs({ hi }: { hi: boolean }) {
  const { c } = useTheme();
  return (
    <View style={styles.emptyContainer}>
      <Icon name="search" size={40} color={c.onSurfaceFaint} />
      <Type v="titleMd" tone="onSurfaceVariant" center>
        {hi ? 'कोई प्रश्न नहीं मिला' : 'No matching questions'}
      </Type>
      <Type v="bodySm" tone="onSurfaceFaint" center>
        {hi
          ? 'कृपया दूसरा शब्द खोजें या सहायता टीम से संपर्क करें।'
          : 'Try searching with different keywords or contact our helpline.'}
      </Type>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xxl,
    gap: Space.sm,
  },
});
