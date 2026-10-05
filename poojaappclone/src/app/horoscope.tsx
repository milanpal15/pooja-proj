import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Card, Chip, Icon, Screen, SectionBand, Type } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { ADMIN_API } from '@/constants/config';
import { RASHI_STORAGE_KEY, RASHIS } from '@/constants/rashis';
import { useLanguage } from '@/context/language';
import { Radius, Space, useTheme } from '@/theme';

/**
 * Rashifal — the daily reading.
 *
 * Unlike the panchang next door, **none of this is computable**. A prediction
 * is somebody's words, so every reading is authored in the dashboard and
 * fetched for the day. When nothing is published the screen says so; it never
 * generates a reading, because a devotee making a decision on invented text
 * is a worse outcome than an empty screen.
 *
 * The chosen sign is remembered locally. Nothing asks for a date of birth —
 * that is personal data the app has no use for.
 */

type Reading = {
  rashi: string;
  prediction: string;
  predictionHi: string;
  luckyColor: string;
  luckyColorHi: string;
  luckyNumber: string;
};

/** `YYYY-MM-DD` in LOCAL time; `toISOString()` would shift the day. */
function todayKey() {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

export default function HoroscopeScreen() {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const hi = lang === 'hi';

  const [rashi, setRashi] = useState(RASHIS[0].id);
  const [readings, setReadings] = useState<Reading[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Remember the devotee's sign between visits.
  useEffect(() => {
    AsyncStorage.getItem(RASHI_STORAGE_KEY)
      .then((v) => {
        if (v && RASHIS.some((r) => r.id === v)) setRashi(v);
      })
      .catch(() => {});
  }, []);

  const pick = useCallback((id: string) => {
    setRashi(id);
    AsyncStorage.setItem(RASHI_STORAGE_KEY, id).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    fetch(`${ADMIN_API}/api/horoscope?date=${todayKey()}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { readings?: Reading[] }) => {
        if (alive) setReadings(data.readings ?? []);
      })
      .catch(() => {
        // Offline or no backend. Distinguished from "published nothing" so
        // the screen can say which, instead of blaming the temple.
        if (alive) setFailed(true);
      })
      .finally(() => clearTimeout(timer));

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  const current = useMemo(() => RASHIS.find((r) => r.id === rashi)!, [rashi]);
  const reading = useMemo(() => readings?.find((r) => r.rashi === rashi), [readings, rashi]);

  const body = hi ? reading?.predictionHi || reading?.prediction : reading?.prediction;
  const colour = hi ? reading?.luckyColorHi || reading?.luckyColor : reading?.luckyColor;

  const today = new Date().toLocaleDateString(hi ? 'hi-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Screen tabBar={false}>
      <AppBar title={t('rashifal')} subtitle={today.toUpperCase()} tinted />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Sign picker */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {RASHIS.map((r) => (
            <Chip
              key={r.id}
              label={hi ? r.nameHi : r.name}
              selected={r.id === rashi}
              onPress={() => pick(r.id)}
            />
          ))}
        </ScrollView>

        {/* The chosen sign */}
        <Card variant="ornate" style={styles.head}>
          <View style={[styles.glyph, { borderColor: c.gold, backgroundColor: c.accentContainer }]}>
            <Type v="numeral" tone="goldInk">
              {current.mark}
            </Type>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Type v="headlineMd" tone="goldInk">
              {hi ? current.nameHi : current.name}
            </Type>
            <Type v="bodySm" tone="onSurfaceVariant">
              {current.western}
            </Type>
          </View>
        </Card>

        <SectionBand title={hi ? 'आज का राशिफल' : "Today's Reading"} tone="purple">
          {readings === null && !failed ? (
            <View style={styles.centre}>
              <ActivityIndicator color={c.gold} />
            </View>
          ) : body ? (
            <View style={{ gap: Space.md }}>
              <Type v="bodyMd">{body}</Type>
              {(!!colour || !!reading?.luckyNumber) && (
                <View style={styles.pair}>
                  {!!colour && (
                    <Lucky label={hi ? 'शुभ रंग' : 'Lucky colour'} value={colour} icon="marigold" />
                  )}
                  {!!reading?.luckyNumber && (
                    <Lucky
                      label={hi ? 'शुभ अंक' : 'Lucky number'}
                      value={reading.luckyNumber}
                      icon="sparkle"
                    />
                  )}
                </View>
              )}
            </View>
          ) : (
            /*
             * Two different silences, told apart on purpose: the temple has
             * not published today, or this device cannot reach it.
             */
            <View style={styles.empty}>
              <Icon name={failed ? 'close' : 'calendar'} size={22} color={c.onSurfaceFaint} />
              <Type v="titleSm" center>
                {failed
                  ? hi
                    ? 'राशिफल लोड नहीं हो सका'
                    : 'Could not load the reading'
                  : hi
                    ? 'आज का राशिफल अभी प्रकाशित नहीं हुआ'
                    : 'No reading published for today yet'}
              </Type>
              <Type v="bodySm" tone="onSurfaceVariant" center>
                {failed
                  ? hi
                    ? 'इंटरनेट जाँचकर पुनः प्रयास करें।'
                    : 'Check your connection and try again.'
                  : hi
                    ? 'मंदिर द्वारा प्रकाशित होते ही यहाँ दिखेगा।'
                    : 'It will appear here once the temple publishes it.'}
              </Type>
            </View>
          )}
        </SectionBand>
      </ScrollView>
    </Screen>
  );
}

function Lucky({
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
    <Card variant="sunken" style={styles.lucky}>
      <Icon name={icon} size={18} color={c.gold} />
      <Type v="labelSm" tone="onSurfaceFaint">
        {label}
      </Type>
      <Type v="titleSm" numberOfLines={1}>
        {value}
      </Type>
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg, paddingBottom: Space.xxl },
  chips: { gap: Space.xs, paddingRight: Space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  glyph: {
    width: 62,
    height: 62,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centre: { paddingVertical: Space.xl, alignItems: 'center' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: Space.lg },
  pair: { flexDirection: 'row', gap: Space.sm },
  lucky: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: Space.md },
});
