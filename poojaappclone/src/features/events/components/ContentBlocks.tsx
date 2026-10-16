import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { EventDetail } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Radius, useTheme } from '@/theme';

import { fill, rewardSummary } from '../lib/events-logic';

/** `rewards` block: what finishing earns, summed from the server's `rewards[]`. Hidden when there are none. */
export function RewardsBlock({ event }: { event: EventDetail }) {
  const { t } = useLanguage();
  const { c } = useTheme();
  const r = rewardSummary(event.rewards);
  const parts = [
    r.coins > 0 ? fill(t('ev_reward_coins'), { n: r.coins }) : '',
    r.badgeCount === 1 ? (r.badgeNames[0] ?? t('ev_reward_badge')) : r.badgeCount > 1 ? fill(t('ev_reward_badges'), { n: r.badgeCount }) : '',
    r.certificate ? t('ev_reward_cert') : '',
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <View style={styles.banner}>
      <LinearGradient colors={[c.accentContainer, c.primaryContainer]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.bg]} />
      <Icon name="star" size={28} color={c.goldInk} />
      <View style={styles.flex}>
        <Type v="titleSm" tone="onAccentContainer">
          {fill(t('ev_rewards_earn'), { parts: parts.join(' + ') })}
        </Type>
        <Type v="bodySm" tone="onAccentContainer">
          {t('ev_rewards_when')}
        </Type>
      </View>
    </View>
  );
}

/** `content` block: about text, FAQ and in-app links. Plain text only. */
export function ContentBlock({ event }: { event: EventDetail }) {
  const { t, lang } = useLanguage();
  const { c } = useTheme();
  const router = useRouter();
  const ct = event.content;
  if (!ct) return null;
  const body = pick(lang, ct.body, ct.bodyHi);
  const faq = ct.faq ?? [];
  // Only in-app paths: a stored link is never handed to the OS.
  const links = (ct.links ?? []).filter((l) => l.label && l.route.startsWith('/'));
  if (!body && faq.length === 0 && links.length === 0) return null;
  return (
    <View style={styles.stack}>
      {!!body && (
        <View style={styles.stack}>
          <Type v="titleMd">{t('ev_about')}</Type>
          <Type v="bodyMd" tone="onSurfaceVariant">
            {body}
          </Type>
        </View>
      )}
      {faq.length > 0 && (
        <View style={styles.stack}>
          <Type v="titleMd">{t('ev_faq')}</Type>
          {faq.map((f, i) => (
            <View key={i} style={[styles.faq, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
              <Type v="titleSm">{pick(lang, f.q, f.qHi)}</Type>
              <Type v="bodySm" tone="onSurfaceVariant">
                {pick(lang, f.a, f.aHi)}
              </Type>
            </View>
          ))}
        </View>
      )}
      {links.map((l, i) => (
        <Pressable key={i} accessibilityRole="link" onPress={() => router.push(l.route as never)} style={styles.link}>
          <Type v="labelLg" tone="primary">
            {l.label}
          </Type>
          <Icon name="chevronRight" size={18} color={c.primary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: Radius.lg + 2, padding: 16 },
  bg: { borderRadius: Radius.lg + 2 },
  stack: { gap: 10 },
  faq: { borderRadius: Radius.lg, borderWidth: 1, padding: 14, gap: 4 },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
});
