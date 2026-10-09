import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Coins, Icon, Type } from '@/components/ui';
import { MediaImage } from '@/components/ui/media-image';
import { useLanguage } from '@/i18n';
import type { ChadhavaOfferingItem } from '@/lib/api';
import { fill } from '@/lib/format';
import { pick } from '@/lib/localized';
import { Radius, useTheme } from '@/theme';

import { MAX_QTY } from '../lib/cart';

type Props = {
  offering: ChadhavaOfferingItem;
  qty: number;
  onChange: (delta: number) => void;
};

/** One offering: ribbon, text, image, price and "+ Choose" that becomes a quantity stepper. */
export function OfferingCard({ offering: o, qty, onChange }: Props) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const title = pick(lang, o.title, o.titleHi);
  const label = pick(lang, o.label, o.labelHi);

  return (
    <Card padded={false} style={{ overflow: 'visible', borderRadius: 18, borderColor: qty > 0 ? c.primary : c.outlineVariant }}>
      {!!label && (
        <View style={[styles.ribbon, { backgroundColor: c.success }]}>
          <Type v="labelSm" color="#FFFFFF">
            {label}
          </Type>
        </View>
      )}
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Type v="titleMd" style={{ fontSize: 15, lineHeight: 20 }}>
            {title}
          </Type>
          {!!(o.desc || o.descHi) && (
            <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={3} style={{ fontSize: 12.5, lineHeight: 19 }}>
              {pick(lang, o.desc, o.descHi)}
            </Type>
          )}
          <View style={{ marginTop: 4 }}>
            <Coins value={o.coins} tone="goldInk" word />
          </View>
        </View>
        <MediaImage uri={o.image} height={104} width={104} radius={14} />
      </View>

      <View style={styles.action}>
        {qty === 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('cs_choose')} ${title}`}
            onPress={() => onChange(1)}
            style={[styles.choose, { backgroundColor: c.primary }, { shadowColor: c.primary, shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 }]}>
            <Icon name="plus" size={16} color={c.onPrimary} strokeWidth={2.6} />
            <Type v="labelLg" tone="onPrimary">
              {t('cs_choose')}
            </Type>
          </Pressable>
        ) : (
          <View style={[styles.stepper, { borderColor: c.primary, backgroundColor: c.containerLowest }]}>
            <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={fill(t('cs_remove_one'), { name: title })} onPress={() => onChange(-1)}>
              <Icon name="minus" size={18} color={c.primary} strokeWidth={2.6} />
            </Pressable>
            <Type v="titleMd" tone="primary" numeric accessibilityLabel={fill(t('cs_qty_label'), { name: title })}>
              {qty}
            </Type>
            <Pressable
              hitSlop={8}
              disabled={qty >= MAX_QTY}
              accessibilityRole="button"
              accessibilityLabel={fill(t('cs_add_one'), { name: title })}
              onPress={() => onChange(1)}>
              <Icon name="plus" size={18} color={qty >= MAX_QTY ? c.outline : c.primary} strokeWidth={2.6} />
            </Pressable>
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  ribbon: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderBottomRightRadius: 14 },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 18 },
  action: { position: 'absolute', right: 8, bottom: -8 },
  choose: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 16, borderRadius: Radius.full },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 40, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1.5 },
});
