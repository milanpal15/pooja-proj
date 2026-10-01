import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Button, Card, Field, Icon, IconButton, ProgressRing, Screen, Type, useToast } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/context/language';
import {
  dayKey,
  EMPTY_ENTRY,
  hasContent,
  type JournalMap,
  readJournal,
  writeEntry,
} from '@/lib/journal';
import { Radius, Space, useTheme } from '@/theme';

/**
 * Daily Spiritual Journal.
 *
 * Two things the export got wrong and this fixes:
 *
 *  1. The japa counter was a plain bordered circle — it looked identical at 0
 *     and at 108, so it showed no progress at all. It is now a real arc with
 *     the "burning wick" ember DESIGN.md asks for, against a 108 mala target.
 *  2. The tinted header used white-on-saffron at roughly 2:1. `AppBar tinted`
 *     puts dark ink on the accent container instead.
 *
 * Entries are still local state — persistence lands with `/v1/journal/:day`
 * (defect 12 in the design doc). The screen is ready for it; the API isn't.
 */

const MALA = 108;

/** Month label for the week strip, in the devotee's language. */
const MONTHS_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/**
 * The 7 days of the week containing `anchor` (Sun–Sat).
 *
 * `dot` marks days that actually have a saved entry — it used to mark "every
 * day earlier than today", which drew a full week of gold dots for a devotee
 * who had never written anything.
 */
function getWeek(anchor: Date, written: Set<string>) {
  const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const todayKey = dayKey();
  const anchorKey = dayKey(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - anchor.getDay() + i);
    const key = dayKey(d);
    return {
      d: DAY_LABELS[i],
      n: d.getDate(),
      key,
      date: d,
      dot: written.has(key),
      active: key === anchorKey,
      today: key === todayKey,
      /** Nothing has been chanted tomorrow yet. */
      future: key > todayKey,
    };
  });
}

export default function JournalScreen() {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const toast = useToast();

  /** Which day is being written. Starts on today; the week strip moves it. */
  const [anchor, setAnchor] = useState(() => new Date());
  const [journal, setJournal] = useState<JournalMap>({});
  const [count, setCount] = useState(0);
  const [gratitude, setGratitude] = useState('');
  const [notes, setNotes] = useState('');
  const [loaded, setLoaded] = useState(false);

  const key = dayKey(anchor);
  const written = useMemo(
    () => new Set(Object.keys(journal).filter((k) => hasContent(journal[k]))),
    [journal],
  );
  const WEEK = useMemo(() => getWeek(anchor, written), [anchor, written]);

  // Load the whole journal once; switching days then costs no storage read.
  useEffect(() => {
    let alive = true;
    readJournal().then((all) => {
      if (!alive) return;
      setJournal(all);
      const e = { ...EMPTY_ENTRY, ...all[dayKey()] };
      setCount(e.count);
      setGratitude(e.gratitude);
      setNotes(e.notes);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Swap the editor over to another day, showing whatever that day holds. */
  const selectDay = useCallback(
    (d: Date) => {
      const e = { ...EMPTY_ENTRY, ...journal[dayKey(d)] };
      setAnchor(d);
      setCount(e.count);
      setGratitude(e.gratitude);
      setNotes(e.notes);
    },
    [journal],
  );

  const shiftWeeks = useCallback(
    (weeks: number) => {
      const d = new Date(anchor);
      d.setDate(d.getDate() + weeks * 7);
      selectDay(d);
    },
    [anchor, selectDay],
  );

  /*
   * Autosave, debounced.
   *
   * The Save button used to be the only way to persist, and it only raised an
   * alert — so a devotee who counted a mala and backed out lost the lot. This
   * writes as they go; Save is now just the acknowledgement.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      writeEntry(key, { count, gratitude, notes }).then((all) => all && setJournal(all));
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [loaded, key, count, gratitude, notes]);

  // One full mala per revolution, so 216 reads as two complete rounds.
  const progress = (count % MALA) / MALA || (count > 0 ? 1 : 0);

  const monthLabel = useMemo(() => {
    if (lang === 'hi') {
      return anchor.toLocaleDateString('hi-IN', { month: 'long', year: 'numeric' });
    }
    return `${MONTHS_EN[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }, [anchor, lang]);

  const saveEntry = useCallback(async () => {
    const all = await writeEntry(key, { count, gratitude, notes });
    if (all) setJournal(all);
    toast.success(t('entry_saved'));
  }, [key, count, gratitude, notes, t, toast]);

  return (
    <Screen tabBar={false}>
      <AppBar
        title={t('journal_title')}
        tinted
        right={
          <IconButton
            name="calendar"
            label="Go to today"
            size={40}
            onPress={() => selectDay(new Date())}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Week strip */}
        <Card variant="sunken">
          <View style={styles.monthRow}>
            <IconButton
              name="back"
              label="Previous week"
              size={32}
              onPress={() => shiftWeeks(-1)}
            />
            <Type v="titleMd">{monthLabel}</Type>
            <IconButton
              name="forward"
              label="Next week"
              size={32}
              onPress={() => shiftWeeks(1)}
            />
          </View>
          <View style={styles.week}>
            {WEEK.map((w) => (
              <Pressable
                key={w.key}
                accessibilityRole="button"
                accessibilityLabel={w.date.toDateString()}
                accessibilityState={{ selected: !!w.active, disabled: w.future }}
                // A day that has not happened cannot be journalled.
                disabled={w.future}
                onPress={() => selectDay(w.date)}
                style={({ pressed }) => [styles.day, pressed && { opacity: 0.6 }]}>
                <Type v="labelSm" tone="onSurfaceFaint">
                  {w.d}
                </Type>
                <View
                  style={[
                    styles.dayNum,
                    w.active && { backgroundColor: c.primary },
                    // Today stays findable once the devotee browses away from it.
                    !w.active && w.today && { borderWidth: 1, borderColor: c.gold },
                    w.future && { opacity: 0.35 },
                  ]}>
                  <Type v="titleSm" color={w.active ? c.onPrimary : c.onSurface}>
                    {w.n}
                  </Type>
                </View>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: w.dot ? c.gold : 'transparent' },
                  ]}
                />
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Japa counter */}
        <View style={styles.counterWrap}>
          <ProgressRing progress={progress} size={244} thickness={9}>
            <View style={styles.counterInner}>
              <Type v="bodyMd" tone="onSurfaceVariant">
                {t('mantras_chanted')}
              </Type>
              <View style={styles.counterRow}>
                <RoundBtn
                  icon="minus"
                  label="One less"
                  onPress={() => setCount((n) => Math.max(0, n - 1))}
                />
                <Type v="numeral" numeric>
                  {count}
                </Type>
                <RoundBtn icon="plus" label="One more" onPress={() => setCount((n) => n + 1)} />
              </View>
              <Type v="labelSm" tone="goldInk">
                ॐ नमः शिवाय
              </Type>
            </View>
          </ProgressRing>
          <Type v="labelSm" tone="onSurfaceFaint">
            {Math.floor(count / MALA)} mala · {count % MALA}/{MALA}
          </Type>
        </View>

        <View style={styles.field}>
          <View style={styles.fieldHead}>
            <Type v="titleLg">{t('daily_gratitude')}</Type>
            <Icon name="diya" size={22} color={c.gold} />
          </View>
          <Field
            value={gratitude}
            onChangeText={setGratitude}
            placeholder={t('grateful_ph')}
          />
        </View>

        <View style={styles.field}>
          <View style={styles.fieldHead}>
            <Type v="titleLg">{t('spiritual_notes')}</Type>
            <Icon name="lotus" size={22} color={c.gold} />
          </View>
          <Field
            value={notes}
            onChangeText={setNotes}
            placeholder={t('reflect_ph')}
            multilineRows={4}
          />
        </View>

        <Button
          label={t('save')}
          icon="check"
          size="lg"
          block
          onPress={saveEntry}
        />
      </ScrollView>
    </Screen>
  );
}

function RoundBtn({
  icon,
  label,
  onPress,
}: {
  icon: 'plus' | 'minus';
  label: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.roundBtn,
        { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 },
      ]}>
      <Icon name={icon} size={20} color={c.onAccent} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg },

  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 4 },
  dayNum: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 5, height: 5, borderRadius: 3 },

  counterWrap: { alignItems: 'center', gap: Space.sm },
  counterInner: { alignItems: 'center', gap: 6 },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  field: { gap: Space.sm },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
