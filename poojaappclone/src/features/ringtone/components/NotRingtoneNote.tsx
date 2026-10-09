import { StyleSheet, View } from 'react-native';

import { Card, Icon, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

/** Say plainly what this does not do. */
export function NotRingtoneNote({ hi }: { hi: boolean }) {
  const { c } = useTheme();
  return (
    <Card variant="sunken" style={{ borderLeftWidth: 3, borderLeftColor: c.gold }}>
      <View style={styles.note}>
        <Icon name="settings" size={16} color={c.goldInk} />
        <View style={{ flex: 1, gap: 3 }}>
          <Type v="titleSm" tone="goldInk">
            {hi ? 'फ़ोन की रिंगटोन नहीं' : 'Not your phone’s ringtone'}
          </Type>
          <Type v="bodySm" tone="onSurfaceVariant">
            {hi
              ? 'यह सेटिंग केवल इस ऐप की आरती सूचनाओं की ध्वनि बदलती है। फ़ोन की कॉल रिंगटोन बदलने के लिए Android की अनुमति चाहिए जो अभी उपलब्ध नहीं है।'
              : 'This changes the sound this app plays for aarti reminders. Replacing the ringtone your phone uses for calls needs an Android permission the app cannot request yet.'}
          </Type>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', gap: Space.sm },
});
