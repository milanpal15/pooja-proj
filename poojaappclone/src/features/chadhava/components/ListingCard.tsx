import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Type } from '@/components/ui';
import { MediaBanner } from '@/components/ui/media-banner';
import { useLanguage } from '@/i18n';
import type { ChadhavaListingCard } from '@/lib/api';
import { fill } from '@/lib/format';
import { pick } from '@/lib/localized';
import { placeLine } from '@/lib/place';
import { useTheme } from '@/theme';

import { dayLabel } from '../lib/window';

/** A listing: banner with the title over it, place + dates in red, summary, full-width CTA. */
export function ListingCard({ listing: l, onOpen }: { listing: ChadhavaListingCard; onOpen: () => void }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const a = dayLabel(l.startsAt, lang);
  const b = dayLabel(l.endsAt, lang);
  const window = a && b ? fill(t('cs_window'), { a, b }) : a || b;
  const title = pick(lang, l.title, l.titleHi);
  const place = placeLine(l.templeName, l.place);
  const summary = pick(lang, l.summary, l.summaryHi);

  return (
    <Card padded={false} onPress={onOpen} accessibilityLabel={title} style={{ borderRadius: 20 }}>
      <MediaBanner uri={l.banner} title={title} height={170} titleSize={19} />
      <View style={styles.body}>
        <Type v="titleMd" style={{ fontSize: 15, lineHeight: 20 }} numberOfLines={3}>
          {title}
        </Type>
        {!!place && (
          <View style={styles.meta}>
            <Icon name="mapPin" size={16} color={c.primary} />
            <Type v="labelMd" tone="primary" numberOfLines={1} style={styles.metaText}>
              {place}
            </Type>
          </View>
        )}
        {!!window && (
          <View style={styles.meta}>
            <Icon name="calendar" size={16} color={c.primary} />
            <Type v="labelMd" tone="primary" style={styles.metaText}>
              {window}
            </Type>
          </View>
        )}
        {!!summary && (
          <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={3} style={{ fontSize: 12.5, lineHeight: 19, marginTop: 2 }}>
            {summary}
          </Type>
        )}
        <Button label={t('cs_offer')} iconRight="chevronRight" block onPress={onOpen} style={{ marginTop: 6 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: 14, gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { flex: 1, fontWeight: '400', fontSize: 12 },
});
