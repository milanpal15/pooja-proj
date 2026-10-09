import { StyleSheet, View } from 'react-native';

import { Card, Icon, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

/**
 * Said plainly rather than implied. Panchang varies by tradition and
 * by the sunrise a temple actually observes; a devotee planning a rite
 * should check with their own temple, not an app.
 */
export function AboutCard({
  hi,
  overridden,
  override,
}: {
  hi: boolean;
  overridden: boolean;
  override: Record<string, string> | null;
}) {
  const { c } = useTheme();
  return (
    <Card variant="sunken" style={{ borderLeftWidth: 3, borderLeftColor: c.gold }}>
      <View style={styles.note}>
        <Icon name="star" size={16} color={c.goldInk} />
        <View style={{ flex: 1, gap: 3 }}>
          <Type v="titleSm" tone="goldInk">
            {hi ? 'गणना के बारे में' : 'About these numbers'}
          </Type>
          <Type v="bodySm" tone="onSurfaceVariant">
            {overridden
              ? hi
                ? 'कुछ मान मंदिर द्वारा प्रकाशित पंचांग से लिए गए हैं; शेष आपके स्थान के सूर्य-चंद्र से गणना किए गए हैं।'
                : 'Some values are published by the temple; the rest are computed from the Sun and Moon for your location.'
              : hi
                ? 'ये गणनाएँ आपके स्थान के सूर्योदय पर आधारित हैं। परंपरा और क्षेत्र के अनुसार पंचांग भिन्न हो सकता है — किसी संस्कार से पूर्व अपने मंदिर से पुष्टि करें।'
                : 'Computed from the Sun and Moon for your location. Panchang differs between traditions and regions — confirm with your own temple before fixing a rite.'}
          </Type>
          {/* A temple's own words about the day, when it published any. */}
          {!!(hi ? override?.noteHi || override?.note : override?.note) && (
            <Type v="bodySm" tone="onSurface">
              {hi ? override?.noteHi || override?.note : override?.note}
            </Type>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', gap: Space.sm, alignItems: 'flex-start' },
});
