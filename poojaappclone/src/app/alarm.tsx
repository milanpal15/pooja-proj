import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

import {
  Button,
  Card,
  Field,
  Icon,
  Screen,
  SectionBand,
  Segmented,
  toast,
  Type,
} from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { type ReminderId, TONES } from '@/constants/reminders';
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

  const {
    state,
    loaded,
    permission,
    reminders,
    activeCount,
    hasRemovedDefaults,
    toggle,
    setTime,
    addReminder,
    removeReminder,
    restoreDefaults,
    prepareChannel,
    isRealAlarm,
    canFullScreen,
    openFullScreenSettings,
    nextAt,
    previewAlarm,
  } = useReminders();

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
  /** The add form, open or not. Null means closed. */
  const [adding, setAdding] = useState<{ title: string; hour: number; minute: number } | null>(
    null,
  );

  /*
   * Deleting is a real choice with a real cost, so it is an Alert and not a
   * toast — the one category the toast rewrite deliberately left to Alert.
   */
  const confirmDelete = useCallback(
    (id: ReminderId, title: string, custom: boolean) => {
      Alert.alert(
        hi ? 'रिमाइंडर हटाएँ?' : 'Delete this reminder?',
        custom
          ? hi
            ? `"${title}" हटा दिया जाएगा।`
            : `"${title}" will be removed.`
          : hi
            ? `"${title}" हटा दिया जाएगा। आप इसे बाद में वापस ला सकते हैं।`
            : `"${title}" will be removed. You can restore the daily cycle later.`,
        [
          { text: hi ? 'रहने दें' : 'Cancel', style: 'cancel' },
          {
            text: hi ? 'हटाएँ' : 'Delete',
            style: 'destructive',
            onPress: () => {
              setEditing(null);
              void removeReminder(id);
              toast.success(hi ? 'रिमाइंडर हटाया गया' : 'Reminder deleted');
            },
          },
        ],
      );
    },
    [hi, removeReminder],
  );

  const submitNew = useCallback(async () => {
    if (!adding) return;
    const title = adding.title.trim();
    if (!title) {
      toast.error(hi ? 'नाम लिखें' : 'Give the reminder a name');
      return;
    }
    if (!(await addReminder(title, adding.hour, adding.minute))) {
      // The only way this fails is a refused notification permission, which
      // `attemptToggle` already explains; say so rather than failing mutely.
      toast.error(hi ? 'सूचनाओं की अनुमति चाहिए' : 'Notifications need to be allowed');
      return;
    }
    setAdding(null);
    toast.success(
      hi ? `${title} जोड़ा गया` : `${title} added for ${formatTime(adding.hour, adding.minute)}`,
    );
  }, [adding, addReminder, hi]);

  useEffect(() => {
    prepareChannel();
  }, [prepareChannel]);

  /*
   * "rings in 11h 48m" is read against a clock, and reading `Date.now()`
   * during render is impure — it also goes stale while the screen is open.
   * A half-minute tick keeps it honest and satisfies the compiler.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /*
   * The add form is the last thing on the page and `autoFocus` raises the
   * keyboard over it, so opening it without scrolling left the devotee
   * typing into a field they could not see.
   */
  const scroller = useRef<ScrollView>(null);
  // Keyed to whether the form is open, not to `adding` itself — that object
  // changes on every keystroke, which would yank the list down as you type.
  const addOpen = adding !== null;
  useEffect(() => {
    if (!addOpen) return;
    const id = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 150);
    return () => clearTimeout(id);
  }, [addOpen]);

  const tone = TONES.find((x) => x.id === state.tone);

  /**
   * "in 11h 48m".
   *
   * The screen used to say nothing about this at all, which is how enabling
   * a reminder for a time that had already passed today looked identical to
   * a reminder that was simply broken.
   */
  const ringsIn = (at?: number) => {
    if (!at) return null;
    const mins = Math.max(0, Math.round((at - now) / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (hi) return h ? `${h} घंटे ${m} मिनट में` : `${m} मिनट में`;
    return h ? `in ${h}h ${m}m` : `in ${m}m`;
  };

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

      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        /* Without this the first tap on Cancel / Add only dismisses the
           keyboard, so the button appears not to work. */
        keyboardShouldPersistTaps="handled">
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
                ? 'स्विच से रिमाइंडर चालू करें। समय बदलने या हटाने के लिए समय पर टैप करें।'
                : 'Use the switch to turn a reminder on. Tap its time to change it or delete it.'}
            </Type>
          </View>

          {reminders.length === 0 && (
            <Type v="bodySm" tone="onSurfaceFaint" center style={{ paddingVertical: Space.md }}>
              {hi
                ? 'कोई रिमाइंडर नहीं। नीचे से जोड़ें।'
                : 'No reminders. Add one below, or restore the daily cycle.'}
            </Type>
          )}

          {reminders.map((r, i) => {
            const on = !!state.enabled[r.id];
            const open = editing === r.id;
            const { hour, minute } = r;

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
                    {on && !!ringsIn(nextAt[r.id]) && (
                      <Type v="labelSm" tone="primary">
                        {ringsIn(nextAt[r.id])}
                      </Type>
                    )}

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
                    onDelete={() => confirmDelete(r.id, hi ? r.titleHi : r.title, r.custom)}
                    onPreview={
                      isRealAlarm
                        ? () => {
                            void previewAlarm(r.id).then((ok) => {
                              if (ok) {
                                toast.info(
                                  hi
                                    ? 'अभी बजा रहे हैं — बंद करने के लिए हटाएँ दबाएँ'
                                    : 'Ringing now — dismiss it from the alarm screen',
                                );
                              }
                            });
                          }
                        : undefined
                    }
                  />
                )}

                {i < reminders.length - 1 && (
                  <View style={[styles.rule, { backgroundColor: c.outlineVariant }]} />
                )}
              </View>
            );
          })}

          <View style={[styles.rule, { backgroundColor: c.outlineVariant }]} />

          {adding ? (
            <View style={styles.addForm}>
              <Field
                label={hi ? 'रिमाइंडर का नाम' : 'Reminder name'}
                icon="bell"
                value={adding.title}
                onChangeText={(title) => setAdding((a) => (a ? { ...a, title } : a))}
                placeholder={hi ? 'जैसे, तुलसी को जल' : 'e.g. Water the tulsi'}
                maxLength={40}
                /* Deliberately NOT autoFocus: the keyboard would cover the
                   time picker directly below, which is half of this form. */
                returnKeyType="done"
              />
              <TimePicker
                hour={adding.hour}
                minute={adding.minute}
                onChange={(hour, minute) => setAdding((a) => (a ? { ...a, hour, minute } : a))}
                hideDone
              />
              <View style={styles.addActions}>
                <Button
                  label={hi ? 'रहने दें' : 'Cancel'}
                  variant="ghost"
                  size="sm"
                  style={{ flex: 1 }}
                  onPress={() => setAdding(null)}
                />
                <Button
                  label={hi ? 'जोड़ें' : 'Add reminder'}
                  size="sm"
                  style={{ flex: 1 }}
                  onPress={() => void submitNew()}
                />
              </View>
            </View>
          ) : (
            <View style={styles.addRow}>
              <Button
                label={hi ? 'नया रिमाइंडर' : 'Add a reminder'}
                variant="outline"
                size="sm"
                icon="plus"
                block
                onPress={() => {
                  setEditing(null);
                  setAdding({ title: '', hour: 6, minute: 0 });
                }}
              />
              {hasRemovedDefaults && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void restoreDefaults()}
                  style={({ pressed }) => [styles.restore, { opacity: pressed ? 0.6 : 1 }]}>
                  <Type v="labelMd" tone="primary">
                    {hi ? 'दैनिक आरती वापस लाएँ' : 'Restore the daily cycle'}
                  </Type>
                </Pressable>
              )}
            </View>
          )}
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

        {/* Android 14 withholds the full-screen ring screen from apps that
            are not phone or alarm apps. The alarm still rings; it just lands
            as a heads-up notification. Say so, and offer the one Settings
            page that changes it, rather than letting it look broken. */}
        {isRealAlarm && !canFullScreen && (
          <Card variant="sunken" style={{ borderLeftWidth: 3, borderLeftColor: c.gold }}>
            <View style={styles.row}>
              <Icon name="bell" size={16} color={c.goldInk} />
              <View style={{ flex: 1, gap: 6 }}>
                <Type v="bodySm" tone="onSurfaceVariant">
                  {hi
                    ? 'अलार्म बजेगा, पर लॉक स्क्रीन पर पूरा नहीं खुलेगा। अनुमति दें तो पूरी स्क्रीन पर बजेगा।'
                    : 'Alarms will ring, but cannot take over the lock screen until you allow full-screen alerts.'}
                </Type>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void openFullScreenSettings()}>
                  <Type v="labelMd" tone="primary">
                    {hi ? 'अनुमति दें' : 'Allow full-screen alerts'}
                  </Type>
                </Pressable>
              </View>
            </View>
          </Card>
        )}

        <Type v="bodySm" tone="onSurfaceFaint">
          {hi
            ? isRealAlarm
              ? 'ये अलार्म आपके फ़ोन पर ही सेट होते हैं — इंटरनेट के बिना भी बजते हैं, और साइलेंट मोड में भी।'
              : 'ये सूचनाएँ आपके फ़ोन पर ही निर्धारित होती हैं। इंटरनेट के बिना भी चलती हैं।'
            : isRealAlarm
              ? 'These ring on your phone itself — with no network and no account, and at alarm volume even when the phone is silenced.'
              : 'These are scheduled on your phone itself, so they arrive with no network and no account.'}
        </Type>
      </ScrollView>
    </Screen>
  );
}

/**
 * Type the time, or step it.
 *
 * `@react-native-community/datetimepicker` would mean another native module
 * and a rebuild, so the hour and minute are two plain numeric fields with an
 * AM/PM toggle — which is also faster than any wheel for a devotee who
 * already knows the time they want.
 *
 * The steppers move by ONE minute. They used to move by five, on the theory
 * that aarti times are round, and that quietly made 4:33 unreachable: there
 * was no other way in, so the stepper's granularity *was* the app's.
 *
 * Laid out in stacked rows rather than one wrapping flex row. An earlier
 * version put the time BETWEEN the two stepper groups, so a wider string
 * pushed them apart and eventually wrapped them onto a second line.
 */
function TimePicker({
  hour,
  minute,
  onChange,
  onDone,
  onDelete,
  onPreview,
  hideDone = false,
}: {
  hour: number;
  minute: number;
  onChange: (h: number, m: number) => void;
  onDone?: () => void;
  /** Shown only for an existing reminder; the add form has nothing to delete. */
  onDelete?: () => void;
  /** Ring it now. Absent where reminders are notifications, not alarms. */
  onPreview?: () => void;
  /** The add form supplies its own Cancel / Add pair. */
  hideDone?: boolean;
}) {
  const { c } = useTheme();
  const { lang } = useLanguage();
  const hi = lang === 'hi';

  /*
   * While a field is being typed it shows exactly what was keyed, including
   * the half-finished "1" on the way to "12" and the empty string left by
   * clearing it. Only a value that is actually a valid time is committed, and
   * blurring drops the draft so the field snaps back to what is stored —
   * so a field can never be left showing a time the reminder does not have.
   */
  const [draft, setDraft] = useState<{ field: 'h' | 'm'; text: string } | null>(null);

  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const pm = hour >= 12;

  const commit = (h: number, m: number) => onChange(((h % 24) + 24) % 24, ((m % 60) + 60) % 60);

  const bump = (dh: number, dm: number) => {
    setDraft(null);
    const total = ((((hour * 60 + minute + dh * 60 + dm) % 1440) + 1440) % 1440);
    onChange(Math.floor(total / 60), total % 60);
  };

  /*
   * A keystroke that could not be part of a real time is dropped, so the
   * field never shows a 99th minute even for an instant. An empty field and
   * a bare "0" are allowed through as drafts — they are on the way to "09" —
   * but only a complete, valid value is committed to the reminder.
   */
  const typeInto = (field: 'h' | 'm', text: string, max: number, apply: (n: number) => void) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    const n = parseInt(digits, 10);
    if (digits !== '' && n > max) return;
    setDraft({ field, text: digits });
    if (digits !== '') apply(n);
  };

  // 12 AM is hour 0 and 12 PM is hour 12, so the 12 folds to 0 either way.
  const typeHour = (text: string) =>
    typeInto('h', text, 12, (n) => {
      if (n >= 1) commit((n % 12) + (pm ? 12 : 0), minute);
    });

  const typeMinute = (text: string) => typeInto('m', text, 59, (n) => commit(hour, n));

  const setMeridiem = (next: 'am' | 'pm') => {
    if ((next === 'pm') === pm) return;
    setDraft(null);
    commit(next === 'pm' ? (hour % 12) + 12 : hour % 12, minute);
  };

  const fieldStyle = (focused: boolean) => [
    styles.timeInput,
    {
      color: c.onSurface,
      borderColor: focused ? c.gold : c.outlineVariant,
      backgroundColor: c.containerLowest,
    },
  ];

  return (
    <View style={[styles.picker, { backgroundColor: c.containerLow }]}>
      <Type v="labelSm" tone="onSurfaceFaint" center>
        {hi ? 'इस समय याद दिलाएँ' : 'REMIND ME AT'}
      </Type>

      {/* Fixed-width fields, centred: nothing here may be sized by its own
          text, or it shifts under the finger that is stepping it. */}
      <View style={styles.timeFields}>
        <TextInput
          accessibilityLabel={hi ? 'घंटा' : 'Hour'}
          value={draft?.field === 'h' ? draft.text : String(h12)}
          onChangeText={typeHour}
          onFocus={() => setDraft({ field: 'h', text: String(h12) })}
          onBlur={() => setDraft(null)}
          keyboardType="number-pad"
          maxLength={2}
          selectTextOnFocus
          returnKeyType="done"
          selectionColor={c.gold}
          style={fieldStyle(draft?.field === 'h')}
        />
        <Type v="numeral" numeric style={styles.timeColon}>
          :
        </Type>
        <TextInput
          accessibilityLabel={hi ? 'मिनट' : 'Minute'}
          value={draft?.field === 'm' ? draft.text : String(minute).padStart(2, '0')}
          onChangeText={typeMinute}
          onFocus={() => setDraft({ field: 'm', text: String(minute).padStart(2, '0') })}
          onBlur={() => setDraft(null)}
          keyboardType="number-pad"
          maxLength={2}
          selectTextOnFocus
          returnKeyType="done"
          selectionColor={c.gold}
          style={fieldStyle(draft?.field === 'm')}
        />
      </View>

      <Segmented
        value={pm ? 'pm' : 'am'}
        onChange={setMeridiem}
        options={[
          { value: 'am', label: hi ? 'पूर्वाह्न' : 'AM' },
          { value: 'pm', label: hi ? 'अपराह्न' : 'PM' },
        ]}
      />

      <View style={styles.stepRow}>
        <StepGroup
          label={hi ? 'घंटा' : 'Hour'}
          onMinus={() => bump(-1, 0)}
          onPlus={() => bump(1, 0)}
        />
        <StepGroup
          label={hi ? 'मिनट' : 'Minute'}
          onMinus={() => bump(0, -1)}
          onPlus={() => bump(0, 1)}
        />
      </View>

      {!hideDone && onPreview && (
        <Pressable
          accessibilityRole="button"
          onPress={onPreview}
          style={({ pressed }) => [
            styles.previewBtn,
            { borderColor: c.outlineVariant, opacity: pressed ? 0.6 : 1 },
          ]}>
          <Icon name="bell" size={15} color={c.goldInk} />
          <Type v="labelMd" tone="goldInk">
            {hi ? 'अभी सुनें' : 'Ring it now'}
          </Type>
        </Pressable>
      )}

      {!hideDone && (
        <View style={styles.pickerActions}>
          {/* A Pressable rather than a Button: the kit has no destructive
              variant, and a delete that looks like every other action is
              how a reminder gets deleted by accident. */}
          {onDelete && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={hi ? 'यह रिमाइंडर हटाएँ' : 'Delete this reminder'}
              onPress={onDelete}
              style={({ pressed }) => [
                styles.deleteBtn,
                { borderColor: c.error, opacity: pressed ? 0.6 : 1 },
              ]}>
              <Icon name="trash" size={15} color={c.error} />
              <Type v="labelMd" tone="error">
                {hi ? 'हटाएँ' : 'Delete'}
              </Type>
            </Pressable>
          )}
          <Button
            label={hi ? 'हो गया' : 'Done'}
            size="sm"
            style={{ flex: 1 }}
            onPress={onDone}
          />
        </View>
      )}
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
  // Fixed width, like every other time display here: a field that sizes to
  // its own text jumps between "9" and "12" as the hour is stepped.
  timeFields: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  timeInput: {
    width: 92,
    height: 68,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    textAlign: 'center',
    fontSize: 34,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    padding: 0,
  },
  timeColon: { fontSize: 34, lineHeight: 42, paddingBottom: 4 },

  pickerActions: { flexDirection: 'row', gap: Space.sm, alignItems: 'center' },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderWidth: 1.2,
    borderRadius: Radius.full,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderWidth: 1.2,
    borderRadius: Radius.full,
  },

  addRow: { gap: Space.sm, paddingTop: Space.sm },
  addForm: { gap: Space.sm, paddingTop: Space.sm },
  addActions: { flexDirection: 'row', gap: Space.sm },
  restore: { alignSelf: 'center', paddingVertical: 6 },

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
