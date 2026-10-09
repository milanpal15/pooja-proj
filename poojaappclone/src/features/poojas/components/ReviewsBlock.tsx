import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Stars, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { PoojaDetail } from '@/lib/api';
import { fill } from '@/lib/format';
import { Saffron, useTheme } from '@/theme';

import { usePoojaReviews } from '../hooks/use-reviews';
import { ReviewCard } from './ReviewCard';

/** Rating summary + reviews. Rendered only when the pooja has a rating (>=1 visible review). */
export function ReviewsBlock({ slug, rating }: { slug: string; rating: NonNullable<PoojaDetail['rating']> }) {
  const { c, scheme } = useTheme();
  const { t } = useLanguage();
  const r = usePoojaReviews(slug, true);
  return (
    <View style={{ gap: 14 }}>
      <LinearGradient colors={scheme === 'dark' ? [c.containerLow, c.containerLow] : [Saffron[50], Saffron[100]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summary}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Type v="headlineLg" numeric style={styles.avg}>
            {rating.avg.toFixed(1)}
          </Type>
          <Stars value={rating.avg} size={16} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Type v="labelMd" tone="onSurfaceVariant" style={{ fontWeight: '400', lineHeight: 18 }}>
            {t('ps_rating_note')}
          </Type>
          <Type v="labelSm" tone="onSurfaceFaint">
            {fill(t('ps_rating_summary'), { avg: rating.avg.toFixed(1), n: rating.count })}
          </Type>
        </View>
      </LinearGradient>

      {r.state === 'error' && r.reviews.length === 0 && (
        <Type v="bodySm" tone="error">
          {t('ps_reviews_error')}
        </Type>
      )}
      <View style={{ gap: 10 }}>
        {r.reviews.map((rv) => (
          <ReviewCard key={rv.id} review={rv} />
        ))}
      </View>
      {r.more && (
        <Pressable
          accessibilityRole="button"
          onPress={r.loadMore}
          style={[styles.more, { borderColor: Saffron[400] }]}>
          <Type v="labelLg" tone="primary" style={{ fontSize: 14 }}>
            {t('ps_reviews_more')}
          </Type>
          <Icon name="chevronDown" size={14} color={c.primary} strokeWidth={2.4} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 18 },
  avg: { fontSize: 40, lineHeight: 44, fontWeight: '700' },
  more: { height: 46, borderWidth: 1.5, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
});
