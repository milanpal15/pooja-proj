import type { ImageSourcePropType } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { ArchImage, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

export function DeityHero({
  art,
  name,
  epithet,
}: {
  art: ImageSourcePropType;
  name: string;
  epithet: string | undefined;
}) {
  const { c } = useTheme();
  return (
    <ArchImage source={art} height={260} fit="contain" style={{ backgroundColor: c.containerLow }}>
      <View style={[styles.wash, { backgroundColor: c.scrim }]} />
      <View style={styles.heroText}>
        <Type v="headlineLg" color="#FFFFFF" center numberOfLines={1}>
          {name}
        </Type>
        <Type v="labelMd" color="#FFFFFF" center style={{ opacity: 0.9 }}>
          {epithet}
        </Type>
      </View>
    </ArchImage>
  );
}

const styles = StyleSheet.create({
  wash: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, opacity: 0.8 },
  heroText: { position: 'absolute', left: Space.md, right: Space.md, bottom: Space.md, gap: 2 },
});
