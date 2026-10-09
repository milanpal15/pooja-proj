import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { CoinDisc, Icon, Type } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * The purple astrologer card. `online` and `rate` come ONLY from the live
 * astrologer list — when either is unknown its line is simply not drawn.
 * Fixed dark ground in both schemes (like the darshan card).
 */
export function AstrologerCard({
  title,
  sub,
  cta,
  onlineLine,
  rateLine,
  onPress,
}: {
  title: string;
  sub: string;
  cta: string;
  onlineLine?: string;
  rateLine?: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <LinearGradient colors={['#24184A', '#4A2A66']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Icon name="user" size={30} color="#F6D27A" filled />
          {!!onlineLine && <View style={styles.live} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          {!!onlineLine && (
            <Type v="labelSm" color="#F6D27A">
              {onlineLine}
            </Type>
          )}
          <Type v="titleMd" color="#FFFFFF">
            {title}
          </Type>
          <Type v="bodySm" color="#FFFFFF" style={{ opacity: 0.85, fontSize: 12 }}>
            {sub}
          </Type>
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.cta}>
        <LinearGradient colors={[...c.sunlight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <Icon name="support" size={18} color={c.onAccent} />
        <Type v="labelMd" tone="onAccent">
          {cta}
        </Type>
      </Pressable>
      {!!rateLine && (
        <View style={styles.rate}>
          <CoinDisc size={16} />
          <Type v="bodySm" color="#FFFFFF" style={{ opacity: 0.85, fontSize: 12 }}>
            {rateLine}
          </Type>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, padding: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#F6D27A', backgroundColor: '#3A2A5E', alignItems: 'center', justifyContent: 'center' },
  live: { position: 'absolute', right: 2, bottom: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#24184A' },
  cta: { height: 44, borderRadius: 22, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  rate: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
