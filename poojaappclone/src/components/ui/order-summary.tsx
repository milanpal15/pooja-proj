import { Pressable, StyleSheet, View } from 'react-native';

import { MediaImage } from './media-image';
import { Type } from './type';
import { Saffron, useTheme } from '@/theme';

/** The chosen pooja + package at the top of checkout: thumbnail, lines, "Change". */
export function OrderSummary({
  image,
  title,
  packageLine,
  date,
  changeLabel,
  onChange,
}: {
  image?: string;
  title: string;
  packageLine: string;
  date?: string;
  changeLabel: string;
  onChange: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.containerLowest, borderColor: Saffron[400] }]}>
      <MediaImage uri={image} height={64} width={64} radius={12} />
      <View style={{ flex: 1, gap: 2 }}>
        <Type v="titleSm" style={{ fontSize: 14, lineHeight: 18 }} numberOfLines={3}>
          {title}
        </Type>
        <Type v="labelMd" tone="onSurfaceVariant" style={{ fontWeight: '400' }}>
          {packageLine}
        </Type>
        {!!date && (
          <Type v="labelMd" tone="onSurfaceVariant" style={{ fontWeight: '400' }}>
            {date}
          </Type>
        )}
      </View>
      <Pressable accessibilityRole="button" onPress={onChange} hitSlop={10}>
        <Type v="labelMd" tone="primary" style={{ fontWeight: '700' }}>
          {changeLabel}
        </Type>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1.5 },
});
