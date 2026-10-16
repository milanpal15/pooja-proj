import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Icon, type IconName, Type } from '@/components/ui';
import { assetUrl } from '@/providers/content';
import { useTheme } from '@/theme';

import type { Columns, TileStyle } from '../lib/layout';

export type QuickItem = { key: string; label: string; icon: IconName; href: string; badge?: string; /** An uploaded picture; replaces the glyph. */ image?: string };

const GUTTER = 16; // the screen's side padding (Frame 'gutter')
const CELL_PAD = 4;

/**
 * The service grid: 3, 4 or 5 tiles across (the block's `columns`) in one of
 * three looks (`tileStyle`):
 *  - icon:  today's rounded tile with the glyph (an uploaded picture replaces it);
 *  - image: the picture fills the whole rounded tile, label underneath; an item
 *           without a picture falls back to its glyph;
 *  - pill:  a compact horizontal pill (small glyph + label), wrapping rows.
 * A badge is a corner pill. The tile shrinks so 5 across fit a 360px phone.
 */
export function QuickGrid({
  items,
  columns = 4,
  tileStyle = 'icon',
  onOpen,
}: {
  items: QuickItem[];
  columns?: Columns;
  tileStyle?: TileStyle;
  onOpen: (href: string) => void;
}) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();

  if (tileStyle === 'pill') {
    return (
      <View style={styles.pills}>
        {items.map((it) => (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityLabel={it.badge ? `${it.label}, ${it.badge}` : it.label}
            onPress={() => onOpen(it.href)}
            style={({ pressed }) => [styles.pill, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }, pressed && { opacity: 0.75 }]}>
            <Icon name={it.icon} size={16} color={c.primary} />
            <Type v="labelMd" tone="onSurface" numberOfLines={1} style={styles.pillLabel}>
              {it.label}
            </Type>
            {!!it.badge && (
              <View style={[styles.pillBadge, { backgroundColor: c.live }]}>
                <Type v="labelSm" color="#FFFFFF" style={styles.badgeText}>
                  {it.badge}
                </Type>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    );
  }

  const cell = (width - GUTTER * 2) / columns;
  const size = Math.min(60, Math.max(40, Math.floor(cell - CELL_PAD * 2 - 2)));
  const full = tileStyle === 'image';

  return (
    <View style={styles.grid}>
      {items.map((it) => (
        <Pressable
          key={it.key}
          accessibilityRole="button"
          accessibilityLabel={it.badge ? `${it.label}, ${it.badge}` : it.label}
          onPress={() => onOpen(it.href)}
          style={({ pressed }) => [styles.cell, { width: `${100 / columns}%` }, pressed && { opacity: 0.75 }]}>
          <View
            style={[
              styles.box,
              { width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: c.containerLowest, borderColor: c.outlineVariant },
              full && !!it.image && styles.boxFull,
            ]}>
            {it.image ? (
              // The picture is laid out normally and rounded itself: an absolutely positioned Image under overflow:hidden + radius draws nothing on Android.
              <Image
                source={{ uri: assetUrl(it.image) }}
                style={{ width: full ? size : size - 2, height: full ? size : size - 2, borderRadius: Math.round(size * (full ? 0.3 : 0.28)) }}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Icon name={it.icon} size={Math.round(size * 0.43)} color={c.primary} />
            )}
          </View>
          {!!it.badge && (
            <View style={[styles.badge, { backgroundColor: c.live }]}>
              <Type v="labelSm" color="#FFFFFF" style={styles.badgeText}>
                {it.badge}
              </Type>
            </View>
          )}
          <Type v="labelSm" tone="onSurfaceVariant" center numberOfLines={2} style={styles.label}>
            {it.label}
          </Type>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  cell: { alignItems: 'center', gap: 7, paddingHorizontal: CELL_PAD },
  box: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  boxFull: { borderWidth: 0 },
  badge: { position: 'absolute', top: -6, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 9, lineHeight: 12 },
  label: { fontSize: 11.5, lineHeight: 14, letterSpacing: 0 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, maxWidth: '100%' },
  pillLabel: { flexShrink: 1 },
  pillBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
});
