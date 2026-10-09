import { StyleSheet, View } from 'react-native';

import { Card, Icon, Type } from '@/components/ui';
import type { RemoteTone } from '@/providers/content';
import { Radius, Space, useTheme } from '@/theme';

/** The current alert tone; tapping it opens the Ringtone screen. */
export function ToneCard({
  hi,
  tone,
  onPress,
}: {
  hi: boolean;
  tone: RemoteTone | undefined;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Card variant="plain" accessibilityLabel="Change alert tone" onPress={onPress}>
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  medallion: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
