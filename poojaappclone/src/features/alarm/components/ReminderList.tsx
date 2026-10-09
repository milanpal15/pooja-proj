import { StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

import type { ReminderId } from '../constants/reminders';
import type { ResolvedReminder } from '../types';

import { ReminderRow } from './ReminderRow';

/** The how-it-works hint, the empty state, and one row per reminder. */
export function ReminderList({
  reminders,
  hi,
  enabled,
  editing,
  nextAt,
  now,
  onToggle,
  onToggleEditor,
  onChangeTime,
  onDone,
  onDelete,
  onPreview,
}: {
  reminders: ResolvedReminder[];
  hi: boolean;
  enabled: Record<string, boolean>;
  editing: ReminderId | null;
  nextAt: Record<string, number>;
  now: number;
  onToggle: (id: ReminderId) => void;
  onToggleEditor: (id: ReminderId, open: boolean) => void;
  onChangeTime: (id: ReminderId, h: number, m: number) => void;
  onDone: () => void;
  onDelete: (r: ResolvedReminder) => void;
  /** Absent where reminders are notifications, not alarms. */
  onPreview?: (id: ReminderId) => void;
}) {
  const { c } = useTheme();

  return (
    <>
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

      {reminders.map((r, i) => (
        <ReminderRow
          key={r.id}
          reminder={r}
          hi={hi}
          on={!!enabled[r.id]}
          open={editing === r.id}
          last={i === reminders.length - 1}
          nextAt={nextAt[r.id]}
          now={now}
          onToggle={() => onToggle(r.id)}
          onToggleEditor={() => onToggleEditor(r.id, editing === r.id)}
          onChangeTime={(h, m) => onChangeTime(r.id, h, m)}
          onDone={onDone}
          onDelete={() => onDelete(r)}
          onPreview={onPreview ? () => onPreview(r.id) : undefined}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    padding: 10,
    marginBottom: Space.xs,
  },
});
