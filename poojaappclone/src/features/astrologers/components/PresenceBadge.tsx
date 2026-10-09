import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { Presence } from '@/lib/api';
import { Radius, useTheme } from '@/theme';

/**
 * Online / Busy / Offline as a word AND a shape (filled disc, square, hollow
 * ring) so it never relies on colour alone.
 */
export function PresenceBadge({ presence }: { presence: Presence }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const word =
    presence === 'online'
      ? t('astro_presence_online')
      : presence === 'busy'
        ? t('astro_presence_busy')
        : t('astro_presence_offline');
  const ink = presence === 'online' ? c.success : presence === 'busy' ? c.goldInk : c.onSurfaceVariant;

  return (
    <View style={[styles.pill, { backgroundColor: c.containerLow }]}>
      <View
        style={[
          styles.shape,
          presence === 'online' && { backgroundColor: ink, borderRadius: Radius.full },
          presence === 'busy' && { backgroundColor: ink, borderRadius: 2 },
          presence === 'offline' && { borderColor: ink, borderWidth: 1.6, borderRadius: Radius.full },
        ]}
      />
      <Type v="labelSm" color={ink}>
        {word}
      </Type>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  shape: { width: 9, height: 9 },
});
