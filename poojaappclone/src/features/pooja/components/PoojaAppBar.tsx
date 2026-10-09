import { Pressable, StyleSheet, Text, View } from 'react-native';

/** Gold app bar: the devotee's avatar, the deity's name, and the aarti count. */
export function PoojaAppBar({
  initial,
  title,
  totalAartis,
  onAvatarPress,
}: {
  initial: string;
  title: string;
  totalAartis: number;
  onAvatarPress: () => void;
}) {
  return (
    <View style={styles.appBar}>
      <Pressable style={styles.avatarBtn} onPress={onAvatarPress}>
        <Text style={styles.avatarText}>{initial}</Text>
      </Pressable>
      <View style={styles.titlePill}>
        <Text style={styles.titleText}>{title}</Text>
      </View>
      <View style={styles.coinPill}>
        <Text style={styles.coinCount}>{totalAartis}</Text>
        <View style={styles.coin}>
          <Text style={styles.coinGlyph}>ॐ</Text>
        </View>
      </View>
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
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 3,
    paddingVertical: 3,
  },
  coinCount: { fontWeight: '700', color: '#3A2A10', fontSize: 14 },
  coin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F5B01A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinGlyph: { fontSize: 13, color: '#7A4A00', fontWeight: '700' },
});
