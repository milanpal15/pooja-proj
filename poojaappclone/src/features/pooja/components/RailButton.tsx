import { Pressable, StyleSheet, Text, View } from 'react-native';

export function RailButton({
  children,
  label,
  active,
  onPress,
}: {
  children: React.ReactNode;
  label?: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.railItem}>
      <View style={[styles.railCircle, active && styles.railCircleActive]}>{children}</View>
      {!!label && <Text style={styles.railLabel}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  railItem: { alignItems: 'center', gap: 2 },
  railCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(60,35,10,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,220,150,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railCircleActive: { backgroundColor: 'rgba(255,196,61,0.35)', borderColor: '#FFD98A' },
  railLabel: { color: '#FFF0CC', fontSize: 10, fontWeight: '600' },
});
