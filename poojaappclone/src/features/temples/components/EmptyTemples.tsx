import { StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Space, useTheme } from '@/theme';

export function EmptyTemples({ onlySaved, query }: { onlySaved: boolean; query: string }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  return (
    <View style={styles.empty}>
      <Icon name={onlySaved ? 'heart' : 'search'} size={30} color={c.onSurfaceFaint} />
      <Type v="bodyMd" tone="onSurfaceVariant" center>
        {onlySaved
          ? t('no_saved_temples_title')
          : lang === 'hi'
            ? `"${query}" के लिए कोई मंदिर नहीं मिला।`
            : `No temples match “${query}”.`}
      </Type>
      {onlySaved && (
        <Type v="bodySm" tone="onSurfaceFaint" center style={{ marginTop: 4, paddingHorizontal: Space.lg }}>
          {t('no_saved_temples_desc')}
        </Type>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xxl },
});
