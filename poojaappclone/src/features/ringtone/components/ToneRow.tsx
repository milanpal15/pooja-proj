import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName, Type } from '@/components/ui';
import type { RemoteTone } from '@/providers/content';
import { Radius, Space, useTheme } from '@/theme';

export function ToneRow({
  tone,
  hi,
  on,
  playing,
  last,
  onPress,
}: {
  tone: RemoteTone;
  hi: boolean;
  /** This is the selected tone. */
  on: boolean;
  playing: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <View>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        onPress={onPress}
        style={({ pressed }) => [styles.tone, pressed && { opacity: 0.8 }]}>
        <View
          style={[
            styles.medallion,
            { backgroundColor: on ? c.primaryContainer : c.containerLow },
          ]}>
          <Icon
            name={playing ? 'pause' : ((tone.icon ?? 'bell') as IconName)}
            size={20}
            color={on ? c.primary : c.onSurfaceFaint}
          />
        </View>

        <View style={{ flex: 1, gap: 1 }}>
          <Type v="titleSm" numberOfLines={1}>
            {hi ? tone.titleHi : tone.title}
          </Type>
          <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
            {hi ? tone.descHi : tone.desc}
          </Type>
        </View>

        {/* Selection is a radio and a colour change, never colour
            alone. */}
        <View style={[styles.radio, { borderColor: on ? c.primary : c.outline }]}>
          {on && <View style={[styles.radioDot, { backgroundColor: c.primary }]} />}
        </View>
      </Pressable>

      {!last && <View style={[styles.rule, { backgroundColor: c.outlineVariant }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  tone: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: 11 },
  medallion: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rule: { height: StyleSheet.hairlineWidth * 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 11, height: 11, borderRadius: Radius.full },
});
