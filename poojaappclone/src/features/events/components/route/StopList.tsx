import { Pressable, StyleSheet, View } from 'react-native';

import { formatDistance } from '@/components/map/distance';
import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, useTheme } from '@/theme';

import { fill } from '../../lib/events-logic';
import { distanceToStop, kmText, placeLabel, type ResolvedStop, stopKey } from '../../lib/route';
import type { LatLng } from '@/components/map/geometry';

/**
 * The ordered list of stops with km marks (and distances when the devotee's position is known). It is
 * what the Route block shows when the native map module is absent or the map cannot load, and every row
 * still opens the same stop card.
 */
export function StopList({ stops, selectedKey, user, onSelect }: { stops: readonly ResolvedStop[]; selectedKey: string | null; user: LatLng | null; onSelect: (key: string) => void }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const state = (s: ResolvedStop) => t(`ev_state_${s.state}` as 'ev_state_done');
  if (stops.length === 0) {
    return (
      <Type v="bodySm" tone="onSurfaceVariant">
        {t('ev_route_no_stops')}
      </Type>
    );
  }
  return (
    <View style={[styles.list, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      {stops.map((s, i) => {
        const d = s.state === 'done' ? null : distanceToStop(user, s);
        const selected = stopKey(s) === selectedKey;
        return (
          <Pressable
            key={stopKey(s)}
            accessibilityRole="button"
            accessibilityLabel={`${fill(t('ev_stop_n'), { n: s.order })}. ${placeLabel(s, lang)}. ${state(s)}`}
            onPress={() => onSelect(stopKey(s))}
            style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.outlineVariant }, selected && { backgroundColor: c.accentContainer }]}>
            <View style={[styles.dot, { backgroundColor: s.state === 'done' ? c.success : s.state === 'locked' ? c.container : c.primary }]}>
              {s.state === 'done' ? (
                <Icon name="check" size={14} color="#FFFFFF" />
              ) : s.state === 'locked' ? (
                <Icon name="clock" size={14} color={c.onSurfaceFaint} />
              ) : (
                <Type v="labelSm" color="#FFFFFF" numeric>
                  {s.order}
                </Type>
              )}
            </View>
            <View style={styles.body}>
              <Type v="titleSm" numberOfLines={2} tone={s.state === 'locked' ? 'onSurfaceVariant' : 'onSurface'}>
                {placeLabel(s, lang)}
              </Type>
              <Type v="bodySm" tone="onSurfaceVariant" numeric>
                {fill(t('ev_stop_km'), { km: kmText(s.routeKm) })}
                {d != null ? ` · ${fill(t('ev_stop_away'), { d: formatDistance(d, lang) })}` : ''}
              </Type>
            </View>
            {s.state === 'next' && (
              <Type v="labelSm" color={c.goldInk}>
                {t('ev_state_next').toUpperCase()}
              </Type>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 56 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
});
