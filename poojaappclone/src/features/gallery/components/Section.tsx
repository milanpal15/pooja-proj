import { StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/components/ui';
import { Space } from '@/theme';

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Space.xl },
});
