import { StyleSheet, View } from 'react-native';

import { Button, Sheet, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import type { LocationPermissionController } from '../hooks/use-location-permission';

/**
 * The app's own explanation, shown BEFORE the system permission prompt. Only "Allow location" raises
 * the system dialog; "Not now" leaves the permission untouched. Foreground only, and says so.
 */
export function LocationRationale({ perm }: { perm: Pick<LocationPermissionController, 'rationaleOpen' | 'confirm' | 'dismiss'> }) {
  const { t } = useLanguage();
  return (
    <Sheet visible={perm.rationaleOpen} onClose={perm.dismiss} title={t('ev_loc_rationale_title')}>
      <Type v="bodyMd" tone="onSurfaceVariant">
        {t('ev_loc_rationale_body')}
      </Type>
      <View style={styles.actions}>
        <Button label={t('ev_loc_allow')} icon="mapPin" onPress={() => void perm.confirm()} block />
        <Button label={t('ev_loc_not_now')} variant="ghost" onPress={perm.dismiss} block />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: Space.sm, marginTop: Space.sm },
});
