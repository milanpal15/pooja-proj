import { StyleSheet, Text, View } from 'react-native';

export function MapHeader({
  eyebrow,
  title,
  location,
  locationColor,
}: {
  eyebrow: string;
  title: string;
  location: string;
  locationColor: string;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.location, { color: locationColor }]}>{location}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 3, paddingTop: 6, paddingHorizontal: 24 },
  eyebrow: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  title: { color: '#fff', fontSize: 23, fontWeight: '700', textAlign: 'center' },
  location: { fontSize: 13, fontWeight: '500' },
});
