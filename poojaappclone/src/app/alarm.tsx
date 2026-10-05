import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button, Card, Icon, Screen, SectionBand, Type } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { REMINDERS, type ReminderId, TONES } from '@/constants/reminders';
import { useLanguage } from '@/context/language';
import { formatTime, useReminders } from '@/hooks/use-reminders';
import { Radius, Space, useTheme } from '@/theme';

/**
 * Aarti reminders — the "Alarm" tile.
 *
 * Not a general alarm clock: the times that matter are the temple's own, so
 * the five defaults follow the traditional daily cycle and a devotee who
 * enables one without editing anything still gets it at the right hour.
 *
 * These are repeating LOCAL notifications. Nothing leaves the device, so they
 * keep working with no backend and no network — which is the whole point at
 * 4:30am for Mangala Aarti.
 *
 * ── Two layout rules this screen learned the hard way ────────────────────
 *
 *  1. Nothing may be sized by the time string. "4:30 AM" and "12:30 PM" are
 *     different widths, so any element that lets the text set its own width
 *     jumps as the hour is stepped — including under the finger doing the
 *     stepping. Every time display has a fixed width and centres inside it.
 *  2. The time has to look tappable. It was plain text with the word "edit"
 *     beside it, which nobody reads as a control. It is a bordered chip with
 *     a calendar glyph and a chevron now.
 */
export default function AlarmScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { lang, t } = useLanguage();
  const hi = lang === 'hi';

  const { state, loaded, permission, activeCount, toggle, setTime, timeFor, prepareChannel } =
    useReminders();

  /*
   * `toggle` answers false when Android refuses the notification permission,
   * and the caller used to drop that on the floor — the switch simply did not
   * move and nothing said why. Android also stops showing its own dialog once
   * the devotee has declined, so the only way back is Settings; that makes
   * this a real choice, which is why it is an Alert rather than a toast.
   */
  const attemptToggle = useCallback(
    async (id: ReminderId) => {
      if (await toggle(id)) return;
      Alert.alert(t('reminders_blocked_title'), t('reminders_blocked_msg'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('open_settings'), onPress: () => void Linking.openSettings().catch(() => {}) },
      ]);
    },
    [toggle, t],
  );
  const [editing, setEditing] = useState<ReminderId | null>(null);

  useEffect(() => {
    prepareChannel();
  }, [prepareChannel]);

  const tone = TONES.find((x) => x.id === state.tone);

  return (
    <Screen tabBar={false}>
      <AppBar
        title={hi ? 'आरती अलार्म' : 'Aarti Reminders'}
        subtitle={
          loaded
            ? `${activeCount} ${hi ? 'चालू' : activeCount === 1 ? 'REMINDER ON' : 'REMINDERS ON'}`
            : undefined
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {permission === 'denied' && activeCount > 0 && (
          <Card variant="sunken" style={{ borderLeftWidth: 3, borderLeftColor: c.error }}>
            <View style={styles.row}>
              <Icon name="bell" size={16} color={c.error} />
              <Type v="bodySm" tone="error" style={{ flex: 1 }}>
                {hi
                  ? 'सूचनाएँ बंद हैं — फ़ोन की सेटिंग्स में अनुमति दें।'
                  : 'Notifications are off — enable them in Settings for these to arrive.'}
              </Type>
            </View>
          </Card>
        )}

        <SectionBand title={hi ? 'दैनिक आरती' : 'The Daily Cycle'} tone="gold">
          {/* Say how it works before the controls, not after them. */}
          <View style={[styles.hint, { backgroundColor: c.accentContainer }]}>
            <Icon name="sparkle" size={14} color={c.goldInk} />
            <Type v="bodySm" tone="onSurfaceVariant" style={{ flex: 1 }}>
              {hi
                ? 'स्विच से रिमाइंडर चालू करें। समय बदलने के लिए समय पर टैप करें।'
                : 'Use the switch to turn a reminder on. Tap its time to change when it arrives.'}
            </Type>
          </View>

          {REMINDERS.map((r, i) => {
            const on = !!state.enabled[r.id];
            const open = editing === r.id;
            const { hour, minute } = timeFor(r.id);

            return (
              <View key={r.id}>
                <View style={styles.reminder}>
                  <View
                    style={[
                      styles.medallion,
                      { backgroundColor: on ? c.primaryContainer : c.containerLow },
                    ]}>
                    <Icon name={r.icon} size={20} color={on ? c.primary : c.onSurfaceFaint} />
                  </View>

                  <View style={styles.reminderBody}>
                    <Type v="titleSm" tone={on ? 'onSurface' : 'onSurfaceFaint'} numberOfLines={1}>
                      {hi ? r.titleHi : r.title}
                    </Type>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${r.title} — change time, currently ${formatTime(hour, minute)}`}
                      onPress={() => setEditing(open ? null : r.id)}
                      style={({ pressed }) => [
                        styles.timeChip,
                        {
                          borderColor: open ? c.gold : c.outlineVariant,
                          backgroundColor: open ? c.accentContainer : c.containerLowest,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}>
                      <Icon name="calendar" size={13} color={c.goldInk} />
                      <Type v="labelMd" tone="goldInk" numeric style={styles.timeChipText}>
                        {formatTime(hour, minute, hi)}
                      </Type>
                      <Icon name={open ? 'close' : 'forward'} size={12} color={c.onSurfaceFaint} />
                    </Pressable>
                  </View>

                  {/* The switch carries a word as well as a position, so its
                      state does not rest on reading a small toggle. */}
                  <View style={styles.switchCol}>
                    <Switch
                      value={on}
                      onValueChange={() => void attemptToggle(r.id)}
                      trackColor={{ true: c.primary, false: c.outlineVariant }}
                      thumbColor={c.containerLowest}
                    />
                    <Type v="labelSm" tone={on ? 'primary' : 'onSurfaceFaint'}>
                      {on ? (hi ? 'चालू' : 'On') : hi ? 'बंद' : 'Off'}
                    </Type>
                  </View>
                </View>

                {open && (
                  <TimePicker
                    hour={hour}
                    minute={minute}
                    onChange={(h, m) => setTime(r.id, h, m)}
                    onDone={() => setEditing(null)}
                  />
                )}

                {i < REMINDERS.length - 1 && (
                  <View style={[styles.rule, { backgroundColor: c.outlineVariant }]} />
                )}
              </View>
            );
          })}
        </SectionBand>

        <Card
          variant="plain"
          accessibilityLabel="Change alert tone"
          onPress={() => router.push('/ringtone')}>
          <View style={styles.row}>
            <View style={[styles.medallion, { backgroundColor: c.accentContainer }]}>
              <Icon name="music" size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Type v="titleSm">{hi ? 'अलर्ट ध्वनि' : 'Alert tone'}</Type>
              <Type v="bodySm" tone="onSurfaceVariant">
                {hi ? tone?.titleHi : tone?.title}
              </Type>
            </View>
            <Icon name="forward" size={18} color={c.onSurfaceFaint} />
          </View>
        </Card>

        <Type v="bodySm" tone="onSurfaceFaint">
          {hi
            ? 'ये सूचनाएँ आपके फ़ोन पर ही निर्धारित होती हैं। इंटरनेट के बिना भी चलती हैं।'
            : 'These are scheduled on your phone itself, so they arrive with no network and no account.'}
        </Type>
      </ScrollView>
    </Screen>
  );
}

/**
 * A stepper rather than a platform time picker.
 *
 * `@react-native-community/datetimepicker` would mean another native module,
 * and aarti times move in five-minute steps around a known hour — a wheel is
 * more machinery than the task needs.
 *
 * Laid out in stacked rows rather than one wrapping flex row. The earlier
 * version put the time BETWEEN the two stepper groups, so a wider string
 * pushed them apart and eventually wrapped them onto a second line.
 */
function TimePicker({
  hour,
  minute,
  onChange,
  onDone,
}: {
  hour: number;
  minute: number;
  onChange: (h: number, m: number) => void;
  onDone: () => void;
}) {
  const { c } = useTheme();
  const { lang } = useLanguage();
  const hi = lang === 'hi';

  const bump = (dh: number, dm: number) => {
    let total = hour * 60 + minute + dh * 60 + dm;
    total = ((total % 1440) + 1440) % 1440;
    onChange(Math.floor(total / 60), total % 60);
  };

  return (
    <View style={[styles.picker, { backgroundColor: c.containerLow }]}>
      <Type v="labelSm" tone="onSurfaceFaint" center>
        {hi ? 'इस समय याद दिलाएँ' : 'REMIND ME AT'}
      </Type>

      {/* Full width and centred, so stepping the hour cannot move anything. */}
      <Type v="numeral" numeric center style={styles.pickerTime}>
        {formatTime(hour, minute, hi)}
      </Type>

      <View style={styles.stepRow}>
        <StepGroup
          label={hi ? 'घंटा' : 'Hour'}
          onMinus={() => bump(-1, 0)}
          onPlus={() => bump(1, 0)}
        />
        <StepGroup
          label={hi ? 'मिनट' : 'Minute'}
          onMinus={() => bump(0, -5)}
          onPlus={() => bump(0, 5)}
        />
      </View>

      <Button label={hi ? 'हो गया' : 'Done'} block size="sm" onPress={onDone} />
    </View>
  );
}

function StepGroup({
  label,
  onMinus,
  onPlus,
}: {
  label: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.stepGroup}>
      <Type v="labelSm" tone="onSurfaceVariant" center>
        {label}
      </Type>
      <View style={styles.stepBtns}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} down`}
          onPress={onMinus}
          style={({ pressed }) => [
            styles.stepBtn,
            { backgroundColor: c.accent, opacity: pressed ? 0.75 : 1 },
          ]}>
          <Icon name="minus" size={18} color={c.onAccent} strokeWidth={2.6} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} up`}
          onPress={onPlus}
          style={({ pressed }) => [
            styles.stepBtn,
            { backgroundColor: c.accent, opacity: pressed ? 0.75 : 1 },
          ]}>
          <Icon name="plus" size={18} color={c.onAccent} strokeWidth={2.6} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },

  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    padding: 10,
    marginBottom: Space.xs,
  },

  reminder: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: 12 },
  reminderBody: { flex: 1, minWidth: 0, gap: 6, alignItems: 'flex-start' },
  medallion: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.2,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  // Fixed: "4:30 AM" and "12:30 PM" must occupy the same space, or the chip
  // resizes under the finger that is stepping the hour.
  timeChipText: { width: 78, textAlign: 'center' },

  // Fixed for the same reason — the switch must not drift as the title or
  // time beside it changes width.
  switchCol: { width: 58, alignItems: 'center', gap: 2 },

  rule: { height: StyleSheet.hairlineWidth * 2 },

  picker: {
    borderRadius: Radius.md,
    padding: Space.md,
    marginBottom: Space.sm,
    gap: Space.sm,
  },
  pickerTime: { width: '100%', textAlign: 'center', fontSize: 34, lineHeight: 42 },

  stepRow: { flexDirection: 'row', gap: Space.sm },
  stepGroup: { flex: 1, alignItems: 'center', gap: 6 },
  stepBtns: { flexDirection: 'row', gap: Space.sm },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
