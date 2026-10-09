import { StyleSheet, View } from 'react-native';

import { Card, Switch, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { fill } from '@/lib/fill';

/** The Online switch. The text beside it always states the current state in words. */
export function AvailabilityCard({
  online,
  rate,
  disabled,
  onChange,
}: {
  online: boolean;
  rate: number | null;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const { t } = useLanguage();
  return (
    <Card variant={online ? 'ornate' : 'plain'}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Type v="titleMd" tone={online ? 'success' : 'onSurface'}>
            {online ? t('am_online_title') : t('am_offline_title')}
          </Type>
          <Type v="bodySm" tone="onSurfaceVariant">
            {online
              ? rate
                ? fill(t('am_online_sub_rate'), { n: rate })
                : t('am_online_sub')
              : t('am_offline_sub')}
          </Type>
        </View>
        <Switch
          value={online}
          onValueChange={onChange}
          disabled={disabled}
          accessibilityLabel={t('am_switch_label')}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12 } });
