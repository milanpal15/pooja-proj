import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { PoojaDetail } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useTheme } from '@/theme';

/** FAQ rows (white, bordered, chevron). One open at a time keeps the page short. */
export function FaqList({ faqs }: { faqs: PoojaDetail['faqs'] }) {
  const { c } = useTheme();
  const { lang } = useLanguage();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <View style={styles.col}>
      {faqs.map((f, i) => {
        const on = open === i;
        return (
          <View key={i} style={[styles.row, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: on }}
              onPress={() => setOpen(on ? null : i)}
              style={styles.q}>
              <Type v="labelLg" style={{ flex: 1, fontSize: 14 }}>
                {pick(lang, f.q, f.qHi)}
              </Type>
              <Icon name="chevronDown" size={16} color={c.onSurface} strokeWidth={2.2} />
            </Pressable>
            {on && (
              <View style={styles.a}>
                <Type v="bodySm" tone="onSurfaceVariant" style={{ lineHeight: 20 }}>
                  {pick(lang, f.a, f.aHi)}
                </Type>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: 8 },
  row: { borderRadius: 14, borderWidth: 1 },
  q: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, minHeight: 50 },
  a: { paddingHorizontal: 14, paddingBottom: 14 },
});
