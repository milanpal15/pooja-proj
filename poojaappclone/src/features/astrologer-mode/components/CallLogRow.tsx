import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { type StringKey, useLanguage } from '@/i18n';
import type { CallRow } from '@/lib/api';
import { fill } from '@/lib/fill';
import { useTheme } from '@/theme';

import { dayOf, formatRupeesFromPaise, shortName, timeOf } from '../lib/money';

/** One call in a log. Money only when the server sends the astrologer's share. */
export function CallLogRow({ row, showDate }: { row: CallRow; showDate?: boolean }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const reason = row.endReason ?? row.status;
  const unanswered = reason === 'missed' || reason === 'declined' || reason === 'cancelled' || reason === 'failed';
  const minutes = Math.max(1, Math.ceil(row.durationSec / 60));
  const when = `${showDate ? `${dayOf(row.startedAt)}, ` : ''}${timeOf(row.startedAt)}`;

  const reasonLabel = (): string => {
    const k = `am_reason_${reason}` as StringKey;
    return t(k) || String(reason);
  };

  return (
    <View style={[styles.row, { borderBottomColor: c.outlineVariant }]}>
      <View style={{ flex: 1, gap: 1 }}>
        <Type v="titleSm" numberOfLines={1}>
          {unanswered && reason === 'missed' ? t('am_missed_call') : shortName(row.devoteeName)}
        </Type>
        <Type v="bodySm" tone="onSurfaceVariant" numeric>
          {unanswered
            ? `${when} · ${reason === 'missed' ? t('am_not_answered') : reasonLabel()}`
            : `${fill(t('start_upto_val'), { n: minutes })} · ${when}`}
        </Type>
      </View>
      {unanswered ? (
        <Type v="labelMd" tone="error">
          {reasonLabel()}
        </Type>
      ) : typeof row.earnedPaise === 'number' ? (
        <Type v="titleSm" tone="success" numeric>
          {`+${formatRupeesFromPaise(row.earnedPaise)}`}
        </Type>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
});
