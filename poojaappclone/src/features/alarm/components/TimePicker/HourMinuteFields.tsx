import { StyleSheet, TextInput, View } from 'react-native';

import { Type } from '@/components/ui';
import { Radius, useTheme } from '@/theme';

/** The half-typed value of one field; see `TimePicker` for why it exists. */
export type TimeDraft = { field: 'h' | 'm'; text: string };

/**
 * Fixed-width fields, centred: nothing here may be sized by its own
 * text, or it shifts under the finger that is stepping it.
 */
export function HourMinuteFields({
  hi,
  h12,
  minute,
  draft,
  onDraft,
  onTypeHour,
  onTypeMinute,
}: {
  hi: boolean;
  h12: number;
  minute: number;
  draft: TimeDraft | null;
  onDraft: (next: TimeDraft | null) => void;
  onTypeHour: (text: string) => void;
  onTypeMinute: (text: string) => void;
}) {
  const { c } = useTheme();

  const fieldStyle = (focused: boolean) => [
    styles.timeInput,
    {
      color: c.onSurface,
      borderColor: focused ? c.gold : c.outlineVariant,
      backgroundColor: c.containerLowest,
    },
  ];

  return (
    <View style={styles.timeFields}>
      <TextInput
        accessibilityLabel={hi ? 'घंटा' : 'Hour'}
        value={draft?.field === 'h' ? draft.text : String(h12)}
        onChangeText={onTypeHour}
        onFocus={() => onDraft({ field: 'h', text: String(h12) })}
        onBlur={() => onDraft(null)}
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
        onChangeText={onTypeMinute}
        onFocus={() => onDraft({ field: 'm', text: String(minute).padStart(2, '0') })}
        onBlur={() => onDraft(null)}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        returnKeyType="done"
        selectionColor={c.gold}
        style={fieldStyle(draft?.field === 'm')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
});
