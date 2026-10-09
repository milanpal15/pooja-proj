import { Pressable, StyleSheet, Text, View } from 'react-native';

export function MusicToggle({
  musicOn,
  label,
  onPress,
}: {
  musicOn: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.musicWrap} onPress={onPress}>
      <View style={[styles.musicBtn, musicOn && styles.musicBtnActive]}>
        <Text style={styles.musicGlyph}>{musicOn ? '❚❚' : '♪'}</Text>
      </View>
      <Text style={styles.musicLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  musicWrap: {
    position: 'absolute',
    right: 12,
    bottom: 96,
    alignItems: 'center',
    gap: 3,
    zIndex: 7,
  },
  musicBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#C2185B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  musicBtnActive: { backgroundColor: '#8E1348', borderColor: '#FFD98A' },
  musicGlyph: { color: '#FFFFFF', fontSize: 20 },
  musicLabel: { color: '#FFF0CC', fontSize: 11, fontWeight: '600' },
});
