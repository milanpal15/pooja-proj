import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CircleButton, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * Round back + share buttons. Over the gallery the title is in the page; once
 * the page scrolls past it the bar carries a condensed title (the design's B).
 */
export function DetailTopBar({ title, scrolled, onShare }: { title?: string; scrolled: boolean; onShare: () => void }) {
  const router = useRouter();
  const { c } = useTheme();
  const { t } = useLanguage();
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: c.surface }}>
      <View style={styles.bar}>
        <CircleButton name="back" label="Go back" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          {scrolled && !!title && (
            <Type v="titleSm" numberOfLines={1}>
              {title}
            </Type>
          )}
        </View>
        {!!title && <CircleButton name="share" label={t('ps_share')} onPress={onShare} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
});
