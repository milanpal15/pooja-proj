import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useOpenHref } from '../hooks/use-open-href';
import type { HomeSlide } from '../types';
import { SlideCard } from './SlideCard';
import { SlideDots } from './SlideDots';

const GAP = 10;
const SIDE = 16;
const PEEK = 44;
const ADVANCE_MS = 4000;

/**
 * The dashboard-managed slider under the search bar. Cards snap one at a time
 * with the next card peeking in; it advances every 4 s and stays put while a
 * finger is down. The timer is keyed on `page`, so a manual swipe restarts the
 * wait instead of fighting it.
 */
export function HomeSlider({ slides }: { slides: HomeSlide[] }) {
  const { width } = useWindowDimensions();
  const open = useOpenHref();
  const ref = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [touching, setTouching] = useState(false);

  const count = slides.length;
  const cardW = count > 1 ? width - SIDE - PEEK : width - SIDE * 2;
  const step = cardW + GAP;
  const current = Math.min(page, Math.max(count - 1, 0));

  useEffect(() => {
    if (count < 2 || touching) return;
    const id = setTimeout(() => {
      const next = (current + 1) % count;
      ref.current?.scrollTo({ x: next * step, animated: true });
      setPage(next);
    }, ADVANCE_MS);
    return () => clearTimeout(id);
  }, [current, count, step, touching]);

  if (!count) return null;

  return (
    <View>
      <ScrollView
        ref={ref}
        horizontal
        snapToInterval={step}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        onTouchStart={() => setTouching(true)}
        onTouchEnd={() => setTouching(false)}
        onTouchCancel={() => setTouching(false)}
        onMomentumScrollEnd={(e) => setPage(Math.min(count - 1, Math.round(e.nativeEvent.contentOffset.x / step)))}>
        {slides.map((s) => (
          <SlideCard key={s.id} slide={s} width={cardW} onPress={s.href ? () => void open(s.href) : undefined} />
        ))}
      </ScrollView>
      <SlideDots count={count} active={current} />
    </View>
  );
}

const styles = StyleSheet.create({ content: { paddingHorizontal: SIDE, gap: GAP } });
