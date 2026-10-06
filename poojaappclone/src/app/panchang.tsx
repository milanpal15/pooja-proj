import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, Icon, Screen, SectionBand, Type } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { ADMIN_API } from '@/constants/config';
import { useLanguage } from '@/context/language';
import { clock, computePanchang, DEFAULT_PLACE, periodText } from '@/lib/panchang';
import { Radius, Space, useTheme } from '@/theme';
import { useContent } from '@/context/content';

/**
 * The daily panchang.
 *
 * Everything here is computed on the device — see `lib/panchang.ts`. There is
 * no backend call and no editorial content, so it works with no network, and
 * it cannot go stale the way the hardcoded festival list did.
 *
 * Location matters: sunrise, and therefore every inauspicious window derived
 * from it, moves by the hour across India. The screen asks for the device's
 * position and says plainly which place the numbers are for, falling back to
 * Kashi rather than refusing to render.
 *
 * A temple can **override** any of it from the dashboard, because panchang is
 * not only astronomy — traditions differ on the tithi, and a temple may
 * observe its own sunrise. Overrides are merged field by field, so a temple
 * correcting the tithi alone keeps every computed value around it, and the
 * screen says when it is showing a temple's figures rather than its own.
 */

/** `YYYY-MM-DD` in LOCAL time; `toISOString()` would shift the day. */
function dayKey(d: Date) {
  const z = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}


export default function PanchangScreen() {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const hi = lang === 'hi';

  const { templeList } = useContent();

  const [offset, setOffset] = useState(0);
  const [place, setPlace] = useState<{ lat: number; lng: number; label: string }>(() => {
    const first = templeList[0];
    return first?.coords.lat
      ? { lat: first.coords.lat, lng: first.coords.lng, label: first.location }
      : DEFAULT_PLACE;
  });

  // Best-effort: a refused permission just leaves the fallback in place.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || !alive) return;
        const pos = await Location.getLastKnownPositionAsync();
        if (!pos || !alive) return;
        setPlace({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: hi ? 'आपका स्थान' : 'Your location',
        });
      } catch {
        // Keep the fallback.
      }
    })();
    return () => {
      alive = false;
    };
  }, [hi]);

  /*
   * Per-date override from the dashboard; null means "use the computed value".
   *
   * Stored with the date it belongs to rather than cleared when the date
   * changes: resetting it in the effect body is a synchronous setState that
   * cascades a render, and stamping it means yesterday's override can never
   * flash over today's numbers while the new fetch is in flight.
   */
  const [fetched, setFetched] = useState<{ key: string; data: Record<string, string> | null }>({
    key: '',
    data: null,
  });

  const date = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d;
  }, [offset]);

  const p = useMemo(
    () => computePanchang(date, place.lat, place.lng),
    [date, place.lat, place.lng],
  );

  // Best-effort, like every other content call: no backend just means the
  // device's own numbers stand.
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const key = dayKey(date);

    fetch(`${ADMIN_API}/api/panchang?date=${key}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { override?: Record<string, string> | null }) => {
        if (alive) setFetched({ key, data: d.override ?? null });
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));

    return () => {
      alive = false;
      controller.abort();
    };
  }, [date]);

  /** Only trust the override if it was fetched for the date on screen. */
  const override = fetched.key === dayKey(date) ? fetched.data : null;

  /** Temple's value when published, else the computed one. */
  const show = useCallback(
    (k: string, fallback: string) => override?.[k] || fallback,
    [override],
  );
  const overridden = !!override;

  /** The computed value in the devotee's own script. */
  const own = useCallback(
    (en: string, dev: string) => (hi ? dev || en : en),
    [hi],
  );

  const dayLabel = date.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Screen tabBar={false}>
      <AppBar title={t('panchang')} subtitle={place.label.toUpperCase()} tinted />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Day stepper */}
        <Card variant="sunken" style={styles.dayRow}>
          <Stepper icon="back" label="Previous day" onPress={() => setOffset((o) => o - 1)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to today"
            onPress={() => setOffset(0)}
            style={{ flex: 1 }}>
            <Type v="titleSm" center numberOfLines={2}>
              {dayLabel}
            </Type>
            {offset !== 0 && (
              <Type v="labelSm" tone="primary" center>
                {hi ? 'आज पर लौटें' : 'Back to today'}
              </Type>
            )}
          </Pressable>
          <Stepper icon="forward" label="Next day" onPress={() => setOffset((o) => o + 1)} />
        </Card>

        {/* The five limbs — panchānga literally means "five limbs". */}
        <SectionBand title={hi ? 'पंचांग के पाँच अंग' : 'The Five Limbs'} tone="gold">
          <View style={{ gap: Space.sm }}>
            <Row
              label={hi ? 'तिथि' : 'Tithi'}
              value={`${show('paksha', own(p.paksha, p.pakshaHi))} ${show('tithi', own(p.tithi, p.tithiHi))}`.trim()}
              icon="calendar"
            />
            <Row label={hi ? 'वार' : 'Vara'} value={hi ? p.varaHi : p.vara} icon="sparkle" />
            <Row label={hi ? 'नक्षत्र' : 'Nakshatra'} value={show('nakshatra', own(p.nakshatra, p.nakshatraHi))} icon="star" />
            <Row label={hi ? 'योग' : 'Yoga'} value={show('yoga', own(p.yoga, p.yogaHi))} icon="lotus" />
            <Row label={hi ? 'करण' : 'Karana'} value={show('karana', own(p.karana, p.karanaHi))} icon="shankh" />
          </View>
        </SectionBand>

        {/* Sun */}
        <SectionBand title={hi ? 'सूर्य' : 'Sun'} tone="crimson">
          <View style={styles.pair}>
            <Stat label={hi ? 'सूर्योदय' : 'Sunrise'} value={show('sunrise', clock(p.sunrise, hi))} icon="diya" />
            <Stat label={hi ? 'सूर्यास्त' : 'Sunset'} value={show('sunset', clock(p.sunset, hi))} icon="sparkle" />
          </View>
        </SectionBand>

        {/* Muhurta */}
        <SectionBand title={hi ? 'मुहूर्त' : 'Muhurta'} tone="forest">
          <View style={{ gap: Space.sm }}>
            <Row
              label={hi ? 'अभिजित मुहूर्त' : 'Abhijit Muhurat'}
              value={show('abhijit', periodText(p.abhijit, hi))}
              icon="check"
              good
            />
            <Row label={hi ? 'राहु काल' : 'Rahu Kaal'} value={show('rahuKaal', periodText(p.rahuKaal, hi))} icon="close" bad />
            <Row label={hi ? 'यमगण्ड' : 'Yamaganda'} value={show('yamaganda', periodText(p.yamaganda, hi))} icon="close" bad />
            <Row label={hi ? 'गुलिक काल' : 'Gulika Kaal'} value={show('gulika', periodText(p.gulika, hi))} icon="close" bad />
          </View>
        </SectionBand>

        {/* Month & season */}
        <SectionBand title={hi ? 'मास एवं ऋतु' : 'Month & Season'} tone="purple">
          <View style={styles.pair}>
            <Stat label={hi ? 'मास' : 'Masa'} value={show('masa', own(p.masa, p.masaHi) || '—')} icon="calendar" />
            <Stat label={hi ? 'ऋतु' : 'Ritu'} value={show('ritu', own(p.ritu, p.rituHi) || '—')} icon="marigold" />
          </View>
        </SectionBand>

        {/*
          Said plainly rather than implied. Panchang varies by tradition and
          by the sunrise a temple actually observes; a devotee planning a rite
          should check with their own temple, not an app.
        */}
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
      </ScrollView>
    </Screen>
  );
}

/* ───────────────────────────────────────────────────────────── pieces ── */

function Stepper({ icon, label, onPress }: { icon: 'back' | 'forward'; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.step,
        { borderColor: c.goldHairline, backgroundColor: c.containerLowest },
        pressed && { opacity: 0.7 },
      ]}>
      <Icon name={icon} size={16} color={c.goldInk} />
    </Pressable>
  );
}

function Row({
  label,
  value,
  icon,
  good,
  bad,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Icon>['name'];
  good?: boolean;
  bad?: boolean;
}) {
  const { c } = useTheme();
  const tint = good ? c.success : bad ? c.error : c.goldInk;
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: c.containerLow }]}>
        <Icon name={icon} size={15} color={tint} />
      </View>
      <Type v="bodyMd" tone="onSurfaceVariant" style={{ flex: 1 }}>
        {label}
      </Type>
      <Type v="titleSm" numberOfLines={1}>
        {value}
      </Type>
    </View>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Icon>['name'];
}) {
  const { c } = useTheme();
  return (
    <Card variant="sunken" style={styles.stat}>
      <Icon name={icon} size={20} color={c.gold} />
      <Type v="labelSm" tone="onSurfaceFaint">
        {label}
      </Type>
      <Type v="titleMd" numberOfLines={1}>
        {value}
      </Type>
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg, paddingBottom: Space.xxl },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  step: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pair: { flexDirection: 'row', gap: Space.sm },
  stat: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: Space.md },
  note: { flexDirection: 'row', gap: Space.sm, alignItems: 'flex-start' },
});
