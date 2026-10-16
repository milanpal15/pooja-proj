import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { type StatusLabel } from '../lib/events-logic';
import { Radius, Space, useTheme } from '@/theme';

export type FilterItem = { key: string; label: string; dot?: string };

/** Horizontal chips; the selected one is filled with the ink colour. `dot` is the type's colour. */
export function FilterChips({ items, selected, onSelect, small = false }: { items: FilterItem[]; selected: string; onSelect: (key: string) => void; small?: boolean }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      {items.map((it) => {
        const on = it.key === selected;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(it.key)}
            style={[
              styles.chip,
              { height: small ? 32 : 38, backgroundColor: on ? c.onSurface : c.containerLowest, borderColor: on ? c.onSurface : c.outlineVariant },
            ]}>
            {!!it.dot && !on && <View style={[styles.dot, { backgroundColor: it.dot }]} />}
            <Type v="labelMd" color={on ? c.surface : c.onSurface} numberOfLines={1}>
              {it.label}
            </Type>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The small label on a cover ("YATRA · 9 DAYS") or a status. Translucent white on art. */
export function CoverTag({ label, tone = 'plain' }: { label: string; tone?: 'plain' | 'live' | 'solid' }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.tag,
        tone === 'live' ? { backgroundColor: c.live, borderColor: c.live } : tone === 'solid' ? { backgroundColor: c.accent, borderColor: c.accent } : styles.tagPlain,
      ]}>
      <Type v="labelSm" color={tone === 'solid' ? c.onAccent : '#FFFFFF'} style={styles.tagText} numberOfLines={1}>
        {label}
      </Type>
    </View>
  );
}

export const toneOfStatus = (s: StatusLabel['tone']): 'plain' | 'live' | 'solid' => (s === 'live' ? 'live' : s === 'open' ? 'solid' : 'plain');

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: Space.sm, paddingHorizontal: Space.margin, paddingVertical: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 9, height: 22, borderRadius: Radius.sm * 2, borderWidth: 1, justifyContent: 'center' },
  tagPlain: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.45)' },
  tagText: { letterSpacing: 0.4 },
});
