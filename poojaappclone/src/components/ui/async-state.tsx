/**
 * `AsyncState` — the three states every remote list owes the devotee: a
 * skeleton while loading, an error with Retry (never a blank screen), and an
 * empty state. Children render only when there is something to show.
 */

import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useLanguage } from '@/i18n';
import { Radius, Space, useTheme } from '@/theme';

import { Button } from './button';
import { Card } from './card';
import { Type } from './type';

export type AsyncStateProps = {
  status: 'loading' | 'ready' | 'error';
  /** Whether stale data is on screen — an error then does not replace it. */
  hasData: boolean;
  onRetry: () => void;
  empty?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  /** Extra action under the empty text (e.g. "Clear filters"). */
  emptyAction?: React.ReactNode;
  /** Height of each skeleton block. */
  skeletonHeight?: number;
  children: React.ReactNode;
};

export function AsyncState({
  status,
  hasData,
  onRetry,
  empty,
  emptyTitle,
  emptyBody,
  emptyAction,
  skeletonHeight = 200,
  children,
}: AsyncStateProps) {
  const { t } = useLanguage();

  if (status === 'loading' && !hasData) return <Skeleton height={skeletonHeight} />;
  if (status === 'error' && !hasData) {
    return (
      <View style={styles.wrap}>
        <Card variant="sunken" style={styles.card}>
          <Type v="titleMd" center>
            {t('ps_load_error')}
          </Type>
          <Type v="bodySm" tone="onSurfaceVariant" center>
            {t('ps_load_error_body')}
          </Type>
          <Button label={t('retry')} variant="outline" size="sm" onPress={onRetry} />
        </Card>
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.wrap}>
        <Card variant="sunken" style={styles.card}>
          {!!emptyTitle && (
            <Type v="titleMd" center>
              {emptyTitle}
            </Type>
          )}
          {!!emptyBody && (
            <Type v="bodySm" tone="onSurfaceVariant" center>
              {emptyBody}
            </Type>
          )}
          {emptyAction}
        </Card>
      </View>
    );
  }
  return <>{children}</>;
}

/** Three softly pulsing blocks standing in for cards. */
export function Skeleton({ height = 200, count = 3 }: { height?: number; count?: number }) {
  const { c } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View
      style={styles.wrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, i) => (
        <Animated.View
          key={i}
          style={{
            height,
            borderRadius: Radius.lg,
            backgroundColor: c.container,
            opacity: pulse,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Space.md, paddingHorizontal: Space.margin, paddingVertical: Space.sm },
  card: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xl },
});
