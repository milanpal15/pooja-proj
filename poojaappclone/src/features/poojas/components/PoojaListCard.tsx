import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Coins, Icon, Type } from '@/components/ui';
import { MediaBanner } from '@/components/ui/media-banner';
import { useLanguage } from '@/i18n';
import type { PoojaCard } from '@/lib/api';
import { pick } from '@/lib/localized';
import { formatPoojaDate } from '@/lib/pooja-dates';
import { placeLine } from '@/lib/place';
import { Space, useTheme } from '@/theme';

/** One pooja on the list: banner, tagline, title, place/date, "Packages from N coins". */
export function PoojaListCard({ pooja: p, onOpen }: { pooja: PoojaCard; onOpen: () => void }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const title = pick(lang, p.title, p.titleHi);
  const date = formatPoojaDate(p.poojaDate, lang) ?? t('ps_every_day');
  const place = placeLine(p.templeName, p.place);

  return (
    <Card padded={false} onPress={onOpen} accessibilityLabel={title} style={styles.card}>
      <MediaBanner uri={p.banner} title={title} tag={p.festivalName || p.tithi}>
        {p.status === 'closing' && <Badge label={t('ps_closing')} tone="live" />}
      </MediaBanner>

      <View style={styles.body}>
        {!!p.tagline && (
          <Type v="labelMd" tone="primary" center numberOfLines={2}>
            {pick(lang, p.tagline, p.taglineHi)}
          </Type>
        )}
        <Type v="titleMd" numberOfLines={3} style={styles.title}>
          {title}
        </Type>
        {!!place && (
          <View style={styles.meta}>
            <Icon name="mapPin" size={16} color={c.primary} />
            <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1} style={{ flex: 1 }}>
              {place}
            </Type>
          </View>
        )}
        <View style={styles.meta}>
          <Icon name="calendar" size={16} color={c.primary} />
          <Type v="bodySm" tone="onSurfaceVariant">
            {[date, p.tithi].filter(Boolean).join(' · ')}
          </Type>
        </View>

        <View style={styles.footer}>
          <View style={{ flex: 1, gap: 2 }}>
            <Type v="labelMd" tone="onSurfaceVariant">
              {t('ps_from_coins')}
            </Type>
            <Coins value={p.fromCoins} size="md" tone="goldInk" word />
          </View>
          <Button label={t('ps_participate')} iconRight="chevronRight" onPress={onOpen} style={{ minWidth: 150 }} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20 },
  body: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14, gap: 6 },
  title: { fontSize: 17, lineHeight: 23 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: Space.sm + 4, marginTop: Space.sm },
});
