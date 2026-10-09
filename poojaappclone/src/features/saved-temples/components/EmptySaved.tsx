import { StyleSheet, View } from 'react-native';

import { Button, Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, Space, useTheme } from '@/theme';

export function EmptySaved({ onExplore }: { onExplore: () => void }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyMedallion, { backgroundColor: c.accentContainer }]}>
        <Icon name="temple" size={48} color={c.primary} />
      </View>
      <Type v="headlineMd" tone="goldInk" center>
        {t('no_saved_temples_title')}
      </Type>
      <Type v="bodyMd" tone="onSurfaceVariant" center style={styles.emptyDesc}>
        {t('no_saved_temples_desc')}
      </Type>
      <Button
        label={t('explore_temples')}
        icon="temple"
        size="md"
        onPress={onExplore}
        style={styles.emptyCta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * `alignSelf` is the point of this, not the margin.
   *
   * A Button that is not `block` sets `alignSelf: 'flex-start'` so it does
   * not stretch to fill a column — which also overrides the centred
   * container around it, leaving the call to action hard against the left
   * edge under centred text.
   */
  emptyCta: {
    marginTop: Space.md,
    alignSelf: 'center',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  emptyMedallion: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  emptyDesc: {
    marginTop: 4,
    lineHeight: 20,
  },
});
