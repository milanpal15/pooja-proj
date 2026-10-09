import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { assetUrl } from '@/providers/content';
import type { RemoteHomeItem } from '@/providers/content';
import { useTheme } from '@/theme';

import { toIconName } from '../lib/icons';
import { toneFor } from '../lib/tones';
import { itemSub, itemTitle } from './section-text';

type Props = { item: RemoteHomeItem; hi: boolean; onPress: (i: RemoteHomeItem) => void };

/**
 * A photo tile: uploaded artwork (laid out normally — an absolutely
 * positioned Image under overflow:hidden + radius draws nothing on Android) or a
 * toned ground, with the title over a dark strip.
 */
export function PhotoTile({ item, hi, onPress }: Props) {
  const { scheme } = useTheme();
  const title = itemTitle(item, hi);
  const img = assetUrl(item.image);
  const [from] = toneFor(title, scheme === 'dark');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => onPress(item)} style={styles.photo}>
      {img ? (
        <Image source={{ uri: img }} style={styles.photoImg} resizeMode="cover" />
      ) : (
        <View style={[styles.photoImg, { backgroundColor: from }]} />
      )}
      <View style={styles.strip}>
        <Type v="labelSm" color="#FFFFFF" center numberOfLines={2}>
          {title}
        </Type>
      </View>
    </Pressable>
  );
}

/** A book tile: icon over a title, two to a row. */
export function BookTile({ item, hi, onPress }: Props) {
  const { c } = useTheme();
  const title = itemTitle(item, hi);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(item)}
      style={[styles.book, { backgroundColor: c.accentContainer, borderColor: c.goldHairline }]}>
      <Icon name={toIconName(item.icon)} size={28} color={c.primary} />
      <Type v="titleSm" center numberOfLines={2}>
        {title}
      </Type>
    </Pressable>
  );
}

/** A list row: title, optional subtitle, chevron. */
export function ListItem({ item, hi, onPress }: Props) {
  const { c } = useTheme();
  const sub = itemSub(item, hi);
  return (
    <Pressable accessibilityRole="button" onPress={() => onPress(item)} style={styles.row}>
      <View style={{ flex: 1 }}>
        <Type v="titleSm" numberOfLines={1}>
          {itemTitle(item, hi)}
        </Type>
        {!!sub && (
          <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
            {sub}
          </Type>
        )}
      </View>
      <Icon name="forward" size={16} color={c.onSurfaceFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  photo: { flex: 1, aspectRatio: 0.8, borderRadius: 14, overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  strip: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 6, backgroundColor: 'rgba(20,8,6,0.7)' },
  book: { flex: 1, minHeight: 84, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center', justifyContent: 'center', gap: 6 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
