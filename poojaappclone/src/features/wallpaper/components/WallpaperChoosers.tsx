import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui';
import type { Deity } from '@/constants/deities';
import type { RemoteWallpaperStyle } from '@/providers/content';
import { Space } from '@/theme';

/** The deity row and the style row of chips. */
export function WallpaperChoosers({
  hi,
  deityList,
  deityIds,
  deityId,
  onDeity,
  styles: wallpaperStyles,
  style,
  onStyle,
}: {
  hi: boolean;
  deityList: Deity[];
  deityIds: string[];
  deityId: string;
  onDeity: (id: string) => void;
  styles: RemoteWallpaperStyle[];
  style: string;
  onStyle: (slug: string) => void;
}) {
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {deityIds.map((id) => {
          const d = deityList.find((x) => x.id === id);
          return (
            <Chip
              key={id}
              label={hi ? (d?.name ?? id) : (d?.title ?? id)}
              selected={id === deityId}
              onPress={() => onDeity(id)}
            />
          );
        })}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {wallpaperStyles.map((s) => (
          <Chip
            key={s.slug}
            label={hi ? (s.titleHi ?? s.title) : s.title}
            selected={s.slug === style}
            onPress={() => onStyle(s.slug)}
          />
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  chips: { gap: Space.sm, paddingVertical: 2, paddingRight: Space.sm },
});
