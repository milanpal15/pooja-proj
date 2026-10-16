import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Icon, NoContent, Screen, Type, useScrollPadding } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import type { MyBadge } from '@/lib/api';
import { pick } from '@/lib/localized';
import { assetUrl } from '@/providers/content';
import { Radius, Space, useTheme } from '@/theme';

import { useMyBadges } from './hooks/use-my-badges';
import { fill, shortDate } from './lib/events-logic';

/** My badges: a grid of what the caller has earned (`GET /api/me/badges`), or an honest empty state. */
export function EventBadgesScreen() {
  const { t } = useLanguage();
  const { c } = useTheme();
  const pad = useScrollPadding(Space.xl);
  const { data, loading, failed, stale, reload } = useMyBadges();

  return (
    <Screen tabBar={false}>
      <AppBar title={t('ev_badges_title')} leftTitle />
      <ScrollView contentContainerStyle={pad} showsVerticalScrollIndicator={false}>
        {loading && !data ? (
          <ActivityIndicator color={c.primary} style={styles.center} />
        ) : failed && !data ? (
          <View style={styles.msg}>
            <NoContent title={t('ev_unreachable')} body="" />
            <Button label={t('ev_retry')} variant="secondary" onPress={reload} />
          </View>
        ) : !data || data.length === 0 ? (
          <NoContent title={t('ev_badges_empty_title')} body={t('ev_badges_empty_body')} />
        ) : (
          <>
            {stale && (
              <Type v="bodySm" tone="onSurfaceVariant" center>
                {t('ev_saved_copy')}
              </Type>
            )}
            <View style={styles.grid}>
              {data.map((b) => (
                <BadgeTile key={`${b.slug}:${b.eventSlug}`} badge={b} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function BadgeTile({ badge }: { badge: MyBadge }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const name = pick(lang, badge.name, badge.nameHi);
  const art = badge.art ? assetUrl(badge.art) : null;
  const when = shortDate(badge.earnedAt);
  return (
    <View
      accessible
      accessibilityLabel={[name, badge.eventTitle, when && fill(t('ev_badge_earned'), { date: when })].filter(Boolean).join('. ')}
      style={[styles.tile, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <View style={[styles.art, { backgroundColor: c.accentContainer }]}>
        {art ? <Image source={{ uri: art }} style={styles.img} resizeMode="contain" /> : <Icon name="star" size={34} color={c.goldInk} />}
      </View>
      <Type v="titleSm" center numberOfLines={2}>
        {name}
      </Type>
      {!!badge.eventTitle && (
        <Type v="bodySm" tone="onSurfaceVariant" center numberOfLines={2}>
          {badge.eventTitle}
        </Type>
      )}
      {!!when && (
        <Type v="labelSm" tone="goldInk" center>
          {fill(t('ev_badge_earned'), { date: when })}
        </Type>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { marginTop: Space.xxl },
  msg: { padding: Space.margin, gap: Space.md, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: Space.margin },
  tile: { width: '47.5%', flexGrow: 1, borderRadius: Radius.lg + 2, borderWidth: 1, padding: 14, gap: 6, alignItems: 'center' },
  art: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  img: { width: 56, height: 56 },
});
