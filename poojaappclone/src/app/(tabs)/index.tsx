import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { TempleGlyph } from '@/components/pooja/temple-glyph';
import { ArchImage, Badge, Card, Icon, IconButton, Screen, SectionBand, SectionHeader, Type, type IconName, useScrollPadding, useToast } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import {
  DAILY,
  DEITY_KNOWLEDGE,
  QUICK_TILES,
  SCRIPTURE,
} from '@/constants/home';
import { type FeatureKey, useAdmin } from '@/context/admin';
import { useAuth } from '@/context/auth';
import { useContent } from '@/context/content';
import { type StringKey, useLanguage } from '@/context/language';
import { Radius, Space, useTheme } from '@/theme';

/**
 * Home — rebuilt to match the reference app's shelf structure.
 *
 * The screen is a stack of typed shelves: a hero, an 8-up utility grid, then
 * `SectionBand` groups colour-coded by what they hold — festivals, daily
 * guidance, scripture, deity knowledge. Colour does the sorting so the eye
 * finds the right shelf before reading a word.
 *
 * Everything is fed from `constants/home.ts`, shaped the way the admin API
 * will serve it, so moving a shelf to the backend later swaps its source
 * rather than rewriting the screen.
 */

const FEATURES: { flag: FeatureKey; labelKey: StringKey; icon: IconName; href: string }[] = [
  { flag: 'virtualPooja', labelKey: 'feat_virtual_pooja', icon: 'diya', href: '/pooja' },
  { flag: 'bhajan', labelKey: 'feat_bhajans', icon: 'music', href: '/bhajan' },
  { flag: 'chadhava', labelKey: 'feat_echadhava', icon: 'marigold', href: '/chadhava' },
  { flag: 'journal', labelKey: 'feat_journal', icon: 'lotus', href: '/journal' },
];

const HERO = [
  { id: 'sawan', titleHi: 'सावन विशेष', title: 'Shravan Special', subHi: 'महत्वपूर्ण तिथियां, व्रत और त्योहार', sub: 'Key dates, fasts and festivals', deity: 'shiva' },
  { id: 'darshan', titleHi: 'लाइव दर्शन', title: 'Live Darshan', subHi: 'मंदिर से सीधा प्रसारण', sub: 'Straight from the sanctum', deity: 'durga' },
  { id: 'chadhava', titleHi: 'ई-चढ़ावा', title: 'E-Chadhava', subHi: 'अपने नाम से अर्पण करें', sub: 'Offer in your own name', deity: 'ganesh' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { user } = useAuth();
  const { flags } = useAdmin();
  // Admin-managed calendar, falling back to the bundled one.
  const { deityArt, deityList, templeList, upcomingFestivals } = useContent();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const scrollPad = useScrollPadding();
  const hi = lang === 'hi';

  const features = FEATURES.filter((f) => flags[f.flag]);
  const festivals = useMemo(() => upcomingFestivals(2), [upcomingFestivals]);

  const go = (href?: string) => href && router.push(href as never);
  const comingSoon = () => toast.info(t('coming_soon'), { description: t('coming_soon_msg') });

  return (
    <Screen watermark>
      <AppBar
        brand={t('brand')}
        back={false}
        right={
          <View style={styles.headerRight}>
          <IconButton
            name="bell"
            label={t('daily_reminders')}
            size={38}
            onPress={() => router.push('/alarm')}
          />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile')}
              onPress={() => router.push('/profile')}
              style={[styles.avatar, { backgroundColor: c.gold }]}>
              <Type v="titleSm" color={c.onAccentContainer}>
                {user?.name?.trim()?.[0]?.toUpperCase() || 'ॐ'}
              </Type>
            </Pressable>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, scrollPad]}
        showsVerticalScrollIndicator={false}>
        <Hero hi={hi} />

        {/* 8-up utility grid. Tiles the app cannot honour yet say so rather
            than opening an empty screen. */}
        <View style={styles.quickGrid}>
          {QUICK_TILES.map((tile) => {
            const gated = tile.flag && !flags[tile.flag as FeatureKey];
            if (gated) return null;
            const soon = tile.badge === 'soon';
            return (
              <Pressable
                key={tile.id}
                accessibilityRole="button"
                accessibilityState={{ disabled: soon }}
                disabled={soon}
                onPress={() => tile.href ? go(tile.href) : comingSoon()}
                style={({ pressed }) => [styles.quickTile, pressed && { opacity: 0.75 }]}>
                <View
                  style={[
                    styles.quickIcon,
                    { backgroundColor: c.containerLowest, borderColor: c.goldHairline },
                    soon && { opacity: 0.45 },
                  ]}>
                  <Icon name={tile.icon} size={26} color={soon ? c.onSurfaceFaint : c.primary} />
                </View>
                <Type v="labelSm" center numberOfLines={1} tone={soon ? 'onSurfaceFaint' : 'onSurface'}>
                  {t(tile.labelKey as StringKey) || tile.label}
                </Type>
                {tile.badge === 'new' && (
                  <View style={styles.tileBadge}>
                    <Badge label="NEW" tone="live" />
                  </View>
                )}
                {soon && (
                  <View style={styles.tileBadge}>
                    <View style={[styles.soonChip, { backgroundColor: c.surfaceDim }]}>
                      <Type v="labelSm" color={c.onSurfaceVariant} style={{ fontSize: 9 }}>
                        {hi ? 'जल्द' : 'SOON'}
                      </Type>
                    </View>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Upcoming vrat & festivals */}
        <SectionBand
          title={hi ? 'आने वाले व्रत एवं त्योहार' : 'Upcoming Vrat & Festivals'}
          tone="crimson"
          footerLabel={hi ? 'सारी तिथि देखें' : 'See all dates'}
          onFooter={() => router.push('/festivals')}>
          <View style={styles.festRow}>
            {/* A lunar calendar runs out. Say so rather than render a void. */}
            {festivals.length === 0 && (
              <Type v="bodySm" tone="onSurfaceFaint" center style={{ flex: 1, paddingVertical: Space.sm }}>
                {hi ? 'आगामी तिथियाँ शीघ्र अपडेट होंगी।' : 'Upcoming dates will be updated soon.'}
              </Type>
            )}
            {festivals.slice(0, 2).map((f) => (
              <Card
                key={f.id}
                variant="sunken"
                style={styles.festCard}
                accessibilityLabel={f.name}
                onPress={() => router.push({ pathname: '/pooja', params: { deity: f.deity } })}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Type v="titleSm" numberOfLines={2}>
                    {hi ? f.nameHi : f.name}
                  </Type>
                  <Type v="labelSm" tone="primary">
                    {formatDay(f.date, hi)}
                  </Type>
                </View>
                {deityArt(f.deity) && (
                  <Image source={deityArt(f.deity)!} style={styles.festArt} resizeMode="contain" />
                )}
              </Card>
            ))}
          </View>
        </SectionBand>

        {/* Today's guidance */}
        <SectionBand title={hi ? 'आज का विशेष' : "Today's Special"} tone="forest">
          <Type v="labelMd" tone="onSurfaceVariant" center>
            {formatToday(hi)}
          </Type>
          {DAILY.map((d, i) => (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              onPress={() => d.href ? go(d.href) : comingSoon()}
              style={({ pressed }) => [
                styles.dailyRow,
                { backgroundColor: c.containerLow },
                pressed && { opacity: 0.8 },
              ]}>
              <Type v="titleSm" tone="onSurfaceFaint" style={styles.dailyNum}>
                {i + 1}
              </Type>
              <View style={[styles.dailyIcon, { backgroundColor: c.accentContainer }]}>
                <Icon name={d.icon} size={20} color={c.primary} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Type v="titleSm" tone="goldInk" numberOfLines={1}>
                  {hi ? d.titleHi : d.title}
                </Type>
                <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
                  {hi ? d.subtitleHi : d.subtitle}
                </Type>
              </View>
              <Icon name="forward" size={16} color={c.onSurfaceFaint} />
            </Pressable>
          ))}
        </SectionBand>

        {/* Popular temples */}
        <View style={styles.section}>
          <SectionHeader title={t('popular_temples')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
            {templeList.map((tpl) => (
              <Card
                key={tpl.id}
                style={styles.templeCard}
                accessibilityLabel={tpl.name}
                onPress={() => router.push({ pathname: '/booking', params: { temple: tpl.id } })}>
                <View style={styles.templeGlyphWrap}>
                  <TempleGlyph temple={tpl} size={92} />
                </View>
                <Type v="labelMd" center numberOfLines={1}>
                  {tpl.name}
                </Type>
              </Card>
            ))}
          </ScrollView>
        </View>

        {/* Flag-gated feature tiles */}
        <View style={styles.grid}>
          {features.map((f) => (
            <Card
              key={f.flag}
              style={styles.featureCard}
              accessibilityLabel={t(f.labelKey)}
              onPress={() => router.push(f.href as never)}>
              <View style={[styles.featureMedallion, { backgroundColor: c.accentContainer }]}>
                <Icon name={f.icon} size={22} color={c.primary} />
              </View>
              <Type v="titleSm" style={{ flex: 1 }} numberOfLines={2}>
                {t(f.labelKey)}
              </Type>
            </Card>
          ))}
        </View>

        {/* Scripture */}
        <SectionBand title={hi ? 'पूजा-पाठ की किताबें' : 'Pooja & Paath Books'} tone="gold">
          <View style={styles.bookGrid}>
            {SCRIPTURE.map((b) => (
              <Pressable
                key={b.id}
                accessibilityRole="button"
                onPress={() => go(b.href)}
                style={({ pressed }) => [
                  styles.bookTile,
                  { backgroundColor: c.containerLow, borderColor: c.goldHairline },
                  pressed && { opacity: 0.8 },
                ]}>
                <Type v="titleSm" style={{ flex: 1 }} numberOfLines={1}>
                  {hi ? b.titleHi : b.title}
                </Type>
                <Icon name={b.icon} size={24} color={c.gold} />
              </Pressable>
            ))}
          </View>
        </SectionBand>

        {/* Deity knowledge */}
        <SectionBand
          title={hi ? 'देवों का ज्ञान' : 'Knowledge of the Gods'}
          tone="purple"
          footerLabel={hi ? 'सभी देव देखें' : 'See all deities'}
          onFooter={() => router.push('/knowledge')}>
          <View style={styles.knowRow}>
            {DEITY_KNOWLEDGE.map((id) => {
              const d = deityList.find((x) => x.id === id);
              const art = deityArt(id);
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={d?.title ?? id}
                  onPress={() => router.push({ pathname: '/knowledge', params: { deity: id } })}
                  style={({ pressed }) => [styles.knowCell, pressed && { opacity: 0.85 }]}>
                  {art ? (
                    <ArchImage source={art} height={130} fit="contain" style={{ backgroundColor: c.containerLow }}>
                      <View style={[styles.knowWash, { backgroundColor: c.scrim }]} />
                      <Type v="labelMd" color="#FFFFFF" center style={styles.knowLabel}>
                        {hi ? d?.name : d?.title}
                      </Type>
                    </ArchImage>
                  ) : (
                    <View style={[styles.knowFallback, { backgroundColor: c.containerLow }]}>
                      <Type v="labelMd" center>
                        {hi ? d?.name : d?.title}
                      </Type>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </SectionBand>

        {/* Daily darshan */}
        {flags.liveDarshan && (
          <View style={styles.section}>
            <SectionHeader title={t('daily_darshan')} />
            <Card
              padded={false}
              accessibilityLabel={t('daily_darshan')}
              onPress={() => router.push('/darshan')}
              style={{ backgroundColor: c.primary, borderColor: c.primary }}>
              <View style={styles.darshanRow}>
                <View style={styles.playCircle}>
                  <Icon name="play" size={20} color={c.onPrimary} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Type v="titleMd" color={c.onPrimary}>
                    Shri Mandir in Temple
                  </Type>
                  <Type v="bodySm" color={c.onPrimary} style={{ opacity: 0.85 }}>
                    Varanasi, India
                  </Type>
                </View>
                <Badge label={t('live')} tone="live" />
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ───────────────────────────────────────────────────────────── hero ── */

function Hero({ hi }: { hi: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  const { deityArt, hero } = useContent();

  /*
   * Carousel copy comes from the dashboard. It was three slides hardcoded in
   * this file — including "Shravan Special", which reads wrong for the ten
   * months of the year that are not Shravan.
   */
  const slides = hero.length
    ? hero.map((h) => ({
        id: h.slug,
        title: h.title,
        titleHi: h.titleHi || h.title,
        sub: h.subtitle ?? '',
        subHi: h.subtitleHi || h.subtitle || '',
        deity: h.deitySlug || 'shiva',
        href: h.href,
      }))
    : HERO;
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);

  // Pages must be exactly the ScrollView's own width, because `pagingEnabled`
  // snaps by that width and nothing else. They were a hardcoded 320 with a
  // trailing margin, so every page drifted further out of alignment and the
  // last card could never be brought fully into view.
  const pageW = width - Space.margin * 2;

  return (
    <View style={styles.heroWrap}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width))
        }>
        {slides.map((h) => (
          <Pressable
            key={h.id}
            accessibilityRole="button"
            onPress={() =>
              (h as { href?: string }).href
                ? router.push((h as { href?: string }).href as never)
                : router.push({ pathname: '/pooja', params: { deity: h.deity } })
            }
            style={[styles.heroPage, { width: pageW }]}>
            <View style={[styles.heroCard, { backgroundColor: c.accentContainer, borderColor: c.goldHairline }]}>
              <View style={{ flex: 1, gap: 6 }}>
                <Type v="headlineMd" tone="primary" numberOfLines={2}>
                  {hi ? h.titleHi : h.title}
                </Type>
                <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={2}>
                  {hi ? h.subHi : h.sub}
                </Type>
              </View>
              {deityArt(h.deity) && (
                <Image source={deityArt(h.deity)!} style={styles.heroArt} resizeMode="contain" />
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {HERO.map((h, i) => (
          <View
            key={h.id}
            style={[
              styles.dot,
              { backgroundColor: i === page ? c.primary : c.outlineVariant },
              i === page && styles.dotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/* ────────────────────────────────────────────────────────── helpers ── */

const HI_MONTHS = ['जनवरी','फ़रवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितम्बर','अक्टूबर','नवम्बर','दिसम्बर'];

function formatDay(iso: string, hi: boolean) {
  const d = new Date(`${iso}T00:00:00`);
  return hi
    ? `${d.getDate()} ${HI_MONTHS[d.getMonth()]}`
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatToday(hi: boolean) {
  const d = new Date();
  return d.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: { width: 36, height: 36, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: Space.margin, gap: Space.lg, paddingTop: Space.xs },
  section: { gap: Space.xs },

  heroWrap: { gap: Space.sm },
  heroPage: {},
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Space.md,
    minHeight: 132,
    flex: 1,
  },
  heroArt: { width: 96, height: 104 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 18 },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Space.md },
  quickTile: { width: '25%', alignItems: 'center', gap: 6 },
  quickIcon: {
    width: 58,
    height: 58,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadge: { position: 'absolute', top: -4, right: 6 },
  soonChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },

  festRow: { flexDirection: 'row', gap: Space.sm },
  festCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 84 },
  festArt: { width: 46, height: 56 },

  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    padding: 10,
  },
  dailyNum: { width: 16, textAlign: 'center' },
  dailyIcon: { width: 38, height: 38, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },

  hscroll: { gap: Space.sm, paddingVertical: 4, paddingRight: Space.sm },
  templeCard: { width: 128, alignItems: 'center', gap: 6 },
  templeGlyphWrap: { height: 96, justifyContent: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  featureCard: { width: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureMedallion: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },

  bookGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  bookTile: {
    width: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 14,
  },

  knowRow: { flexDirection: 'row', gap: Space.sm },
  knowCell: { flex: 1 },
  knowWash: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60, opacity: 0.75 },
  knowLabel: { position: 'absolute', left: 4, right: 4, bottom: 10 },
  knowFallback: { height: 130, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },

  darshanRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, padding: 14 },
  playCircle: {
    width: 46,
    height: 46,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
