import { Pressable, StyleSheet, View } from 'react-native';

import { CallIcon } from '@/components/call-icons';
import { Avatar, Card, Type } from '@/components/ui';
import { assetUrl } from '@/providers/content';
import { useLanguage } from '@/i18n';
import type { Astrologer } from '@/lib/api';
import { fill } from '@/lib/fill';
import { Radius, useTheme } from '@/theme';

import { PresenceBadge } from './PresenceBadge';

/** One row of the list. Presentational: the screen decides what Call does. */
export function AstrologerCard({
  astrologer: a,
  onCall,
}: {
  astrologer: Astrologer;
  onCall: (a: Astrologer) => void;
}) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const canCall = a.presence === 'online';
  const btnLabel =
    a.presence === 'online'
      ? t('astro_btn_call')
      : a.presence === 'busy'
        ? t('astro_btn_busy')
        : t('astro_btn_offline');

  const meta = [
    a.languages?.join(', '),
    a.yearsExperience ? fill(t('astro_years'), { n: a.yearsExperience }) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card style={styles.card}>
      <Avatar
        name={a.name}
        photoUrl={assetUrl(a.photoUrl ?? undefined)}
        size={56}
        presence={a.presence}
      />
      <View style={styles.body}>
        <Type v="titleMd" numberOfLines={1}>
          {a.name}
        </Type>
        {!!a.specialities?.length && (
          <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
            {a.specialities.join(' · ')}
          </Type>
        )}
        {!!meta && (
          <Type v="labelMd" tone="onSurfaceFaint" numberOfLines={1}>
            {meta}
          </Type>
        )}
        <View style={styles.row}>
          <PresenceBadge presence={a.presence} />
          <Type v="labelMd" tone="goldInk" numeric>
            {fill(t('astro_rate'), { n: a.ratePerMin })}
          </Type>
          {typeof a.ratingAvg === 'number' && !!a.ratingCount && (
            <Type v="labelMd" tone="onSurfaceVariant" numeric>
              {`★ ${a.ratingAvg.toFixed(1)} (${a.ratingCount})`}
            </Type>
          )}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${btnLabel}, ${a.name}`}
        accessibilityState={{ disabled: !canCall }}
        disabled={!canCall}
        onPress={() => onCall(a)}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: canCall ? c.primary : c.container, opacity: pressed ? 0.85 : 1 },
        ]}>
        {canCall && <CallIcon name="phone" size={16} color={c.onPrimary} />}
        <Type v="labelMd" color={canCall ? c.onPrimary : c.onSurfaceVariant}>
          {btnLabel}
        </Type>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  btn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
