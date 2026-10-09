import { ScrollView, StyleSheet } from 'react-native';

import { Space } from '@/theme';

/** The scrolling body of every step but the chooser. */
export function AuthScroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, paddingBottom: Space.xxl },
});
