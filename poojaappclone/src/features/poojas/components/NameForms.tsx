import { StyleSheet, View } from 'react-native';

import { Card, Field, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { fill } from '@/lib/format';
import { Space } from '@/theme';

import type { NameEntry, NameError } from '../lib/names';

/** One name + gotra card per person — the count follows the chosen package. */
export function NameForms({
  names,
  errors,
  onChange,
}: {
  names: NameEntry[];
  errors: (NameError | undefined)[];
  onChange: (index: number, patch: Partial<NameEntry>) => void;
}) {
  const { t } = useLanguage();
  const msg: Record<NameError, string> = {
    name_short: t('ps_name_short'),
    name_long: t('ps_name_long'),
    gotra_long: t('ps_gotra_long'),
  };
  return (
    <View style={styles.col}>
      <Type v="titleMd" style={{ fontSize: 17, marginTop: 4 }}>
        {t('ps_names_h')}
      </Type>
      {names.map((n, i) => {
        const err = errors[i];
        return (
          <Card key={i} style={styles.card}>
            {names.length > 1 && (
              <Type v="labelMd" tone="primary" style={{ fontWeight: '700' }}>
                {fill(t('ps_person_n'), { n: i + 1 })}
              </Type>
            )}
            <Field
              label={t('ps_full_name')}
              placeholder={n.name ? undefined : t('ps_name_ph')}
              value={n.name}
              onChangeText={(name) => onChange(i, { name })}
              autoCapitalize="words"
              autoComplete="name"
              maxLength={80}
              error={err === 'name_short' || err === 'name_long' ? msg[err] : undefined}
            />
            <Field
              label={t('ps_gotra')}
              placeholder={t('ps_gotra_ph')}
              value={n.gotra}
              onChangeText={(gotra) => onChange(i, { gotra })}
              autoCapitalize="words"
              maxLength={60}
              error={err === 'gotra_long' ? msg[err] : undefined}
            />
          </Card>
        );
      })}
      <Type v="labelSm" tone="onSurfaceFaint">
        {fill(t('ps_names_hint'), { n: names.length })}
      </Type>
    </View>
  );
}

const styles = StyleSheet.create({ col: { gap: Space.sm + 2 }, card: { gap: Space.sm + 2 } });
