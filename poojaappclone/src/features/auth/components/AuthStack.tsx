import { StyleSheet, View } from 'react-native';

import { IconButton, Type } from '@/components/ui';
import { Space } from '@/theme';

export function AuthStack({
  title,
  onBack,
  children,
}: {
  title: string;
  /** Omitted when there is nowhere to go back to (a half-finished sign-in). */
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <View style={styles.header}>
        {onBack ? (
          <IconButton name="back" label="Go back" size={40} onPress={onBack} />
        ) : (
          <View style={{ width: 40 }} />
        )}
        <Type v="headlineMd" tone="goldInk" center style={{ flex: 1 }}>
          {title}
        </Type>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.stackBody}>{children}</View>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Space.lg },
  stackBody: { gap: Space.md },
});
