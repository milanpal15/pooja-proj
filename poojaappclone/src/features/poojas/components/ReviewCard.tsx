import { StyleSheet, View } from 'react-native';

import { Stars, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { PoojaReview } from '@/lib/api';
import { Gold, useTheme } from '@/theme';

/** One review: initial avatar, name, package · date, stars and the text. */
export function ReviewCard({ review: rv }: { review: PoojaReview }) {
  const { c } = useTheme();
  const { lang } = useLanguage();
  const date = new Date(rv.createdAt).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
  return (
    <View style={[styles.card, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <View style={styles.top}>
        <View style={[styles.avatar, { backgroundColor: Gold[100] }]}>
          <Type v="labelLg" color={c.goldInk}>
            {rv.name.trim().charAt(0).toUpperCase()}
          </Type>
        </View>
        <View style={{ flex: 1 }}>
          <Type v="titleSm" style={{ fontSize: 14 }}>
            {rv.name}
          </Type>
          <Type v="labelSm" tone="onSurfaceVariant" style={{ fontSize: 11, letterSpacing: 0 }}>
            {[date, rv.packageName].filter(Boolean).join(' · ')}
          </Type>
        </View>
        <Stars value={rv.rating} size={14} />
      </View>
      {!!rv.text && (
        <Type v="bodySm" style={{ marginTop: 8, lineHeight: 20 }}>
          {rv.text}
        </Type>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
