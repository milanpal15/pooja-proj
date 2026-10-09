import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { clock12 } from '../lib/live-logic';
import { Radius, useTheme } from '@/theme';

/** One aarti of the day with its Remind me / Reminder on switch. */
export function ScheduleRow({
  time,
  title,
  subtitle,
  on,
  onToggle,
  last,
}: {
  time: string;
  title: string;
  subtitle: string;
  on: boolean;
  onToggle: () => void;
  last: boolean;
}) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const { clock, meridiem } = clock12(time);
  return (
    <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: c.outlineVariant }]}>
      <View style={styles.time}>
        <Type v="titleSm" tone="goldInk" numeric>
          {clock}
        </Type>
        <Type v="labelSm" tone="onSurfaceVariant">
          {meridiem}
        </Type>
      </View>
      <View style={styles.text}>
        <Type v="titleSm" numberOfLines={1}>
          {title}
        </Type>
        <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
          {subtitle}
        </Type>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={onToggle}
        style={[
          styles.btn,
          { backgroundColor: on ? c.accentContainer : c.containerLowest, borderColor: on ? c.accent : c.outlineVariant },
        ]}>
        <Icon name="bell" size={16} color={c.primary} filled={on} />
        <Type v="labelMd" tone="primary">
          {on ? t('ld_reminder_on') : t('ld_remind')}
        </Type>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  time: { width: 58 },
  text: { flex: 1, minWidth: 0 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
});
