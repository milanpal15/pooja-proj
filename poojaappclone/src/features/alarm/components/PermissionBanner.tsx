import { StyleSheet, View } from 'react-native';

import { Card, Icon, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

export function PermissionBanner({ hi }: { hi: boolean }) {
  const { c } = useTheme();
  return (
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
});
