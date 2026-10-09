import { Pressable, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { Kumkum } from '@/theme';

import type { HomeSlide } from '../types';
import { Banner } from './Banner';
import { HeroHtmlSlide } from './HeroHtmlSlide';

export const SLIDE_H = 160;

/**
 * One slider card: artwork under a dark left scrim, a tag pill, title,
 * subtitle and (only when the dashboard set a label) a white button pill.
 * These sit on artwork, so their colours are fixed rather than themed.
 * A card with no link is plain information, not a button.
 */
export function SlideCard({ slide, width, onPress }: { slide: HomeSlide; width: number; onPress?: () => void }) {
  const box = { width, height: SLIDE_H, borderRadius: 20 };

  if (slide.kind === 'html') {
    return (
      <View style={box}>
        <HeroHtmlSlide slide={slide} onPress={onPress} />
      </View>
    );
  }

  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={slide.title} disabled={!onPress} onPress={onPress}>
      <Banner uri={slide.image} seed={slide.id} scrim="left" style={box}>
        <View style={styles.text}>
          {!!slide.tag && (
            <View style={styles.tag}>
              <Type v="labelSm" color="#2A1A16" numberOfLines={1}>
                {slide.tag}
              </Type>
            </View>
          )}
          {!!slide.title && (
            <Type v="titleLg" color="#FFFFFF" numberOfLines={2} style={styles.title}>
              {slide.title}
            </Type>
          )}
          {!!slide.sub && (
            <Type v="bodySm" color="#FFFFFF" numberOfLines={1} style={styles.sub}>
              {slide.sub}
            </Type>
          )}
          {!!slide.cta && (
            <View style={styles.cta}>
              <Type v="labelMd" color={Kumkum[600]}>
                {slide.cta} ›
              </Type>
            </View>
          )}
        </View>
      </Banner>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: { position: 'absolute', left: 16, top: 0, bottom: 0, width: '68%', justifyContent: 'center', gap: 6, alignItems: 'flex-start' },
  tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: '#F6D27A' },
  title: { fontSize: 18, lineHeight: 22 },
  sub: { opacity: 0.9, fontSize: 12 },
  cta: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#FFFFFF', justifyContent: 'center', marginTop: 4 },
});
