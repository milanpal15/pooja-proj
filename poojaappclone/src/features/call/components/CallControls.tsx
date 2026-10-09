import { Pressable, StyleSheet, View } from 'react-native';

import { CallIcon, type CallIconName } from '@/components/call-icons';
import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, useTheme } from '@/theme';

type RoundProps = {
  icon: CallIconName;
  label: string;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
};

function Round({ icon, label, active, danger, onPress }: RoundProps) {
  const { c } = useTheme();
  const bg = danger ? c.live : active ? c.accent : c.glass;
  const ink = danger ? '#FFFFFF' : active ? c.onAccent : c.onSurface;
  return (
    <View style={styles.cell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={danger ? undefined : { selected: !!active }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: bg, borderColor: c.glassBorder, opacity: pressed ? 0.8 : 1 },
          danger && styles.danger,
        ]}>
        <CallIcon name={icon} size={danger ? 30 : 26} color={ink} />
      </Pressable>
      <Type v="labelMd" tone="onSurfaceVariant">
        {label}
      </Type>
    </View>
  );
}

/** Mute · End · Speaker. End is larger and red, and always carries a word. */
export function CallControls({
  muted,
  speaker,
  onMute,
  onSpeaker,
  onEnd,
}: {
  muted: boolean;
  speaker: boolean;
  onMute: () => void;
  onSpeaker: () => void;
  onEnd: () => void;
}) {
  const { t } = useLanguage();
  return (
    <View style={styles.row}>
      <Round
        icon={muted ? 'micOff' : 'mic'}
        label={muted ? t('call_unmute') : t('call_mute')}
        active={muted}
        onPress={onMute}
      />
      <Round icon="phoneEnd" label={t('call_end')} danger onPress={onEnd} />
      <Round icon="speaker" label={t('call_speaker')} active={speaker} onPress={onSpeaker} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-end' },
  cell: { alignItems: 'center', gap: 6 },
  btn: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  danger: { width: 76, height: 76, borderWidth: 0 },
});
