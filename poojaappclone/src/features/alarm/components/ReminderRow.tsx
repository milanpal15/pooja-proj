import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

import { ringsIn } from '../lib/rings-in';
import { formatTime } from '../lib/time';
import type { ResolvedReminder } from '../types';

import { TimePicker } from './TimePicker';

/** One reminder: medallion, name, time chip, switch — and its time editor when open. */
export function ReminderRow({
  reminder: r,
  hi,
  on,
  open,
  last,
  nextAt,
  now,
  onToggle,
  onToggleEditor,
  onChangeTime,
  onDone,
  onDelete,
  onPreview,
}: {
  reminder: ResolvedReminder;
  hi: boolean;
  on: boolean;
  open: boolean;
  last: boolean;
  nextAt: number | undefined;
  now: number;
  onToggle: () => void;
  onToggleEditor: () => void;
  onChangeTime: (h: number, m: number) => void;
  onDone: () => void;
  onDelete: () => void;
  onPreview?: () => void;
}) {
  const { c } = useTheme();
  const { hour, minute } = r;

  return (
    <View>
      <View style={styles.reminder}>
        <View
          style={[styles.medallion, { backgroundColor: on ? c.primaryContainer : c.containerLow }]}>
          <Icon name={r.icon} size={20} color={on ? c.primary : c.onSurfaceFaint} />
        </View>

        <View style={styles.reminderBody}>
          <Type v="titleSm" tone={on ? 'onSurface' : 'onSurfaceFaint'} numberOfLines={1}>
            {hi ? r.titleHi : r.title}
          </Type>
          {on && !!ringsIn(nextAt, now, hi) && (
            <Type v="labelSm" tone="primary">
              {ringsIn(nextAt, now, hi)}
            </Type>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${r.title} — change time, currently ${formatTime(hour, minute)}`}
            onPress={onToggleEditor}
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
            onValueChange={onToggle}
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
          onChange={onChangeTime}
          onDone={onDone}
          onDelete={onDelete}
          onPreview={onPreview}
        />
      )}

      {!last && <View style={[styles.rule, { backgroundColor: c.outlineVariant }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
