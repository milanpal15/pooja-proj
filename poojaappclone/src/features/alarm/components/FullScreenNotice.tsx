import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Icon, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

/**
 * Android 14 withholds the full-screen ring screen from apps that
 * are not phone or alarm apps. The alarm still rings; it just lands
 * as a heads-up notification. Say so, and offer the one Settings
 * page that changes it, rather than letting it look broken.
 */
export function FullScreenNotice({ hi, onAllow }: { hi: boolean; onAllow: () => void }) {
  const { c } = useTheme();
  return (
    <Card variant="sunken" style={{ borderLeftWidth: 3, borderLeftColor: c.gold }}>
      <View style={styles.row}>
        <Icon name="bell" size={16} color={c.goldInk} />
        <View style={{ flex: 1, gap: 6 }}>
          <Type v="bodySm" tone="onSurfaceVariant">
            {hi
              ? 'अलार्म बजेगा, पर लॉक स्क्रीन पर पूरा नहीं खुलेगा। अनुमति दें तो पूरी स्क्रीन पर बजेगा।'
              : 'Alarms will ring, but cannot take over the lock screen until you allow full-screen alerts.'}
          </Type>
          <Pressable accessibilityRole="button" onPress={onAllow}>
            <Type v="labelMd" tone="primary">
              {hi ? 'अनुमति दें' : 'Allow full-screen alerts'}
            </Type>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
});
