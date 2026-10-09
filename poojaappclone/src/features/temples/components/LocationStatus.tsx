import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { LocationState } from '@/hooks/use-location';
import { useTheme } from '@/theme';

/**
 * Location state is reported inline rather than through an alert —
 * a denied permission is a condition, not an interruption.
 */
export function LocationStatus({ loc, onRetry }: { loc: LocationState; onRetry: () => void }) {
  const { c } = useTheme();
  const { t } = useLanguage();

  return (
    <>
      {loc.status !== 'granted' && (
        <View style={styles.locRow}>
          {loc.status === 'locating' ? (
            <>
              <ActivityIndicator size="small" color={c.primary} />
              <Type v="bodySm" tone="onSurfaceVariant">
                {t('locating')}
              </Type>
            </>
          ) : (
            <>
              <Icon name="mapPin" size={14} color={c.error} />
              <Type v="bodySm" tone="error" style={{ flex: 1 }}>
                {loc.status === 'denied' ? t('location_denied') : t('location_unavailable')}
              </Type>
              {loc.status === 'unavailable' && (
                <Button label="Retry" variant="ghost" size="sm" onPress={onRetry} />
              )}
            </>
          )}
        </View>
      )}

      {loc.status === 'granted' && (
        <View style={styles.locRow}>
          <Icon name="check" size={14} color={c.success} strokeWidth={2.4} />
          <Type v="labelSm" tone="onSurfaceVariant">
            {t('nearest_first')}
          </Type>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
});
