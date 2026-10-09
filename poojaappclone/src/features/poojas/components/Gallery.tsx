import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { MediaImage } from '@/components/ui/media-image';
import { Radius } from '@/theme';

/**
 * The inset (16px, 20px radius) swipeable gallery with the design's overlay:
 * an outlined tag chip, the title, and page dots. A single picture shows no dots.
 */
export function Gallery({
  images,
  height = 200,
  title,
  tag,
}: {
  images: string[];
  height?: number;
  title?: string;
  tag?: string;
}) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const list = images.length ? images : [''];

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <FlatList
          data={list}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(u, i) => `${i}:${u}`}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => <MediaImage uri={item} height={height} width={width} radius={Radius.xl - 4} />}
        />
      )}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.05)', 'rgba(30,10,5,0.6)']}
        style={[StyleSheet.absoluteFill, styles.overlay, { height }]}>
        {!!tag && (
          <View style={styles.tag}>
            <Type v="labelSm" color="#FFFFFF" numberOfLines={1}>
              {tag}
            </Type>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {!!title && (
          <Type v="headlineMd" color="#FFFFFF" numberOfLines={3} style={styles.title}>
            {title}
          </Type>
        )}
        {list.length > 1 && (
          <View style={styles.dots}>
            {list.map((_, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: i === page ? '#FFFFFF' : 'rgba(255,255,255,0.6)', width: i === page ? 22 : 6 }]} />
            ))}
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16 },
  overlay: { borderRadius: Radius.xl - 4, padding: 18 },
  tag: {
    alignSelf: 'flex-start',
    maxWidth: '80%',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  title: { maxWidth: 260, fontWeight: '700', lineHeight: 29 },
  dots: { flexDirection: 'row', gap: 5, marginTop: 10, height: 6 },
  dot: { height: 6, borderRadius: 3 },
});
