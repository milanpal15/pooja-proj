import { StyleSheet, View } from 'react-native';

import { Chip, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { Gender } from '@/lib/api';
import { Space } from '@/theme';

import { GENDERS } from '../constants';

export function GenderChips({
  value,
  onChange,
  error,
}: {
  value: Gender | null;
  onChange: (g: Gender) => void;
  /** Shown beneath the chips when the failure belongs to this field. */
  error?: string;
}) {
  const { t } = useLanguage();
  return (
    <View style={{ gap: 6 }}>
      <Type v="labelMd" tone="onSurfaceVariant">
        {t('gender_label')}
      </Type>
      <View style={styles.genderRow}>
        {GENDERS.map((g) => (
          <Chip
            key={g.value}
            label={t(g.labelKey)}
            selected={value === g.value}
            onPress={() => onChange(g.value)}
          />
        ))}
      </View>
      {!!error && (
        <Type v="labelMd" tone="error">
          {error}
        </Type>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.xs },
});
