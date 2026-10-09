import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { LiveAartiToday } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Radius, useTheme } from '@/theme';

import { time12 } from '../lib/live-logic';

/** Today's aartis at this temple: the live one marked, finished ones dimmed. */
export function TodayList({ aartis }: { aartis: LiveAartiToday[] }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  return (
    <View style={[styles.card, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      {aartis.map((a, i) => {
        const now = a.status === 'live';
        return (
          <View
            key={`${a.time}|${a.name}`}
            style={[styles.row, i < aartis.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.outlineVariant }]}>
            <Type v="labelMd" tone="goldInk" numeric style={styles.time}>
              {time12(a.time)}
            </Type>
            <View style={[styles.dot, { backgroundColor: now ? c.live : c.outlineVariant }]} />
            <Type
              v={now ? 'titleSm' : 'bodyMd'}
              tone={a.status === 'done' ? 'onSurfaceFaint' : 'onSurface'}
              style={styles.name}
              numberOfLines={1}>
              {pick(lang, a.name, a.nameHi)}
            </Type>
            {now && (
              <Type v="labelSm" tone="live">
                {t('ld_live_tag')}
              </Type>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg + 2, borderWidth: 1, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  time: { width: 70 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { flex: 1 },
});
