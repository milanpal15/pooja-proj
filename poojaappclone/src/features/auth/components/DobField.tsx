import { useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

import type { DobParts } from '../types';

/**
 * Date of birth as three boxes.
 *
 * Fully controlled on the three PARTS, not on the joined `YYYY-MM-DD`
 * string, and it keeps no state of its own. Two bugs came out of trying to
 * be cleverer than that:
 *
 *  - Deriving the boxes from the joined string meant the first digit of the
 *    day produced an incomplete date, which the parent stores as '', which
 *    came straight back as three empty boxes. Every keystroke was discarded
 *    and the field simply could not be typed into.
 *  - Keeping the parts in local state instead fixed the typing but froze
 *    them at mount, so a date already on the server — which arrives a
 *    moment later, after the profile sync — never appeared.
 */
export function DobField({
  label,
  parts,
  onChange,
}: {
  label: string;
  parts: DobParts;
  onChange: (p: DobParts) => void;
}) {
  const { c } = useTheme();
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const edit = (
    key: keyof DobParts,
    raw: string,
    max: number,
    nextBox?: React.RefObject<TextInput | null>,
  ) => {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, max);
    onChange({ ...parts, [key]: digits });
    // Move on once a box is full: three taps to fill a date people type in
    // one breath is the kind of friction that gets a sign-up abandoned.
    if (digits.length === max) nextBox?.current?.focus();
  };

  // Written out rather than built by a helper: passing the refs into one
  // would be touching them during render, which is both what the lint rule
  // forbids and a real way to end up reading a stale node.
  const boxStyle = (flex: number) => [
    styles.dobBox,
    { flex, color: c.onSurface, borderColor: c.outlineVariant, backgroundColor: c.containerLowest },
  ];

  return (
    <View style={{ gap: 6 }}>
      <Type v="labelMd" tone="onSurfaceVariant">
        {label}
      </Type>
      <View style={styles.dobRow}>
        <TextInput
          value={parts.d}
          placeholder="DD"
          placeholderTextColor={c.onSurfaceFaint}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel={`${label} — day`}
          onChangeText={(t) => edit('d', t, 2, monthRef)}
          style={boxStyle(1)}
        />
        <TextInput
          ref={monthRef}
          value={parts.m}
          placeholder="MM"
          placeholderTextColor={c.onSurfaceFaint}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel={`${label} — month`}
          onChangeText={(t) => edit('m', t, 2, yearRef)}
          style={boxStyle(1)}
        />
        <TextInput
          ref={yearRef}
          value={parts.y}
          placeholder="YYYY"
          placeholderTextColor={c.onSurfaceFaint}
          keyboardType="number-pad"
          maxLength={4}
          accessibilityLabel={`${label} — year`}
          onChangeText={(t) => edit('y', t, 4)}
          style={boxStyle(1.6)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dobRow: { flexDirection: 'row', gap: Space.xs },
  dobBox: {
    height: 52,
    borderWidth: 1.2,
    borderRadius: Radius.md,
    textAlign: 'center',
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 8,
  },
});
