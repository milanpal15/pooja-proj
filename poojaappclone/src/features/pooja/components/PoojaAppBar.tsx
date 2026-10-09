import { Pressable, StyleSheet, Text, View } from 'react-native';

/** Gold app bar: the devotee's avatar (opens Profile, as on every other screen) and the deity's name. */
export function PoojaAppBar({
  initial,
  title,
  onAvatarPress,
}: {
  initial: string;
  title: string;
  onAvatarPress: () => void;
}) {
  return (
    <View style={styles.appBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Profile" style={styles.avatarBtn} onPress={onAvatarPress}>
        <Text style={styles.avatarText}>{initial}</Text>
      </Pressable>
      <View style={styles.titlePill}>
        <Text style={styles.titleText}>{title}</Text>
      </View>
      {/* Balances the avatar so the title stays centred. */}
      <View style={[styles.avatarBtn, styles.spacer]} />
    </View>
  );
}

const styles = StyleSheet.create({
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 10,
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { backgroundColor: 'transparent' },
  avatarText: { color: '#C0392B', fontWeight: '700', fontSize: 15 },
  titlePill: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    paddingVertical: 7,
    marginHorizontal: 6,
  },
  titleText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
