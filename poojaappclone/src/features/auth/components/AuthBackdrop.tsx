import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Mandala } from '@/components/ui';
import { Fill, useTheme } from '@/theme';

/**
 * The sunlit wash with two mandalas behind every sign-in step. Not unified
 * with the language screen's: its sizes differ slightly and unifying them
 * would move pixels.
 */
export function AuthBackdrop({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, overflow: 'hidden' }}>
      <LinearGradient
        colors={[c.accentContainer, c.surface, c.accentContainer]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[Fill, { pointerEvents: 'none' }]}
      />
      <Mandala size={360} opacity={0.08} style={styles.mandalaTop} />
      <Mandala size={300} opacity={0.07} petals={12} style={styles.mandalaBottom} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  mandalaTop: { position: 'absolute', top: -100, left: -120 },
  mandalaBottom: { position: 'absolute', bottom: -80, right: -90 },
});
