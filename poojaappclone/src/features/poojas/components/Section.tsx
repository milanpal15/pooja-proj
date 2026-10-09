import { StyleSheet, View } from 'react-native';

import { RuledTitle } from '@/components/ui';

/** A titled block that reports its top offset so the tab bar can scroll to it. `bare` omits the heading. */
export function Section({
  title,
  bare,
  onTop,
  children,
}: {
  title: string;
  bare?: boolean;
  onTop: (y: number) => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.wrap} onLayout={(e) => onTop(e.nativeEvent.layout.y)}>
      {!bare && <RuledTitle>{title}</RuledTitle>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },
});
