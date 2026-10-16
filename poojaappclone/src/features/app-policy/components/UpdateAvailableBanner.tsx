import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, Space, useTheme } from '@/theme';

import { openStore } from '../lib/open-store';
import { formatIstDate, pickMessage, type Policy } from '../lib/policy';

/** `update_available`: a dismissible card at the top. "Later" snoozes it for `snoozeDays`. */
export function UpdateAvailableBanner({ policy, onLater }: { policy: Policy; onLater: () => void }) {
  const { t, lang } = useLanguage();
  const { c, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  const by = formatIstDate(policy.graceUntil, lang);
  const body = pickMessage(policy, lang, '') || (policy.recommendedVersionName ? t('ap_avail_version').replace('{v}', policy.recommendedVersionName) : t('ap_avail_body'));
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + Space.sm }]}>
      <View style={[styles.card, { backgroundColor: c.containerLowest, borderColor: c.goldHairline }, elevation.high]}>
        <Type v="titleMd" accessibilityRole="header">
          {t('ap_avail_title')}
        </Type>
        <Type v="bodySm" tone="onSurfaceVariant">
          {body}
        </Type>
        {!!by && (
          <Type v="labelMd" tone="goldInk">
            {t('ap_avail_by').replace('{date}', by)}
          </Type>
        )}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('ap_avail_later_a11y')} onPress={onLater} style={styles.later}>
            <Type v="labelLg" tone="primary">
              {t('ap_avail_later')}
            </Type>
          </Pressable>
          {!!policy.storeUrl && <Button label={t('ap_avail_cta')} size="sm" onPress={() => openStore(policy.storeUrl)} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Space.md, right: Space.md, zIndex: 50 },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: Space.md, gap: Space.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: Space.sm, marginTop: Space.xs },
  later: { minHeight: 44, minWidth: 44, paddingHorizontal: Space.md, alignItems: 'center', justifyContent: 'center' },
});
