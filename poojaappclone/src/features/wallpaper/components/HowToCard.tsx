import { StyleSheet, View } from 'react-native';

import { Card, Icon, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

export function HowToCard({ hi }: { hi: boolean }) {
  const { c } = useTheme();
  return (
    <Card variant="sunken" style={{ borderLeftWidth: 3, borderLeftColor: c.gold }}>
      <View style={styles.note}>
        <Icon name="star" size={16} color={c.goldInk} />
        <View style={{ flex: 1, gap: 3 }}>
          <Type v="titleSm" tone="goldInk">
            {hi ? 'सेट कैसे करें' : 'How to set it'}
          </Type>
          <Type v="bodySm" tone="onSurfaceVariant">
            {hi
              ? 'अपना लुक चुनें, फिर "वॉलपेपर सेट करें" दबाएँ — होम स्क्रीन, लॉक स्क्रीन या दोनों पर। प्रति रखने के लिए "गैलरी में सहेजें" चुनें।'
              : 'Pick a look, then tap “Set as wallpaper” and choose Home screen, Lock screen or both. “Save to gallery” keeps a copy.'}
          </Type>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', gap: Space.sm },
});
