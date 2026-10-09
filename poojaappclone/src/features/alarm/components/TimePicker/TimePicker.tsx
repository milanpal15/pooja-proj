import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Segmented, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, Space, useTheme } from '@/theme';

import { HourMinuteFields, type TimeDraft } from './HourMinuteFields';
import { PickerActions } from './PickerActions';
import { StepGroup } from './StepGroup';

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
export function TimePicker({
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
  const [draft, setDraft] = useState<TimeDraft | null>(null);

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

  return (
    <View style={[styles.picker, { backgroundColor: c.containerLow }]}>
      <Type v="labelSm" tone="onSurfaceFaint" center>
        {hi ? 'इस समय याद दिलाएँ' : 'REMIND ME AT'}
      </Type>

      <HourMinuteFields
        hi={hi}
        h12={h12}
        minute={minute}
        draft={draft}
        onDraft={setDraft}
        onTypeHour={typeHour}
        onTypeMinute={typeMinute}
      />

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

      {!hideDone && (
        <PickerActions hi={hi} onDone={onDone} onDelete={onDelete} onPreview={onPreview} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  picker: {
    borderRadius: Radius.md,
    padding: Space.md,
    marginBottom: Space.sm,
    gap: Space.sm,
  },
  stepRow: { flexDirection: 'row', gap: Space.sm },
});
