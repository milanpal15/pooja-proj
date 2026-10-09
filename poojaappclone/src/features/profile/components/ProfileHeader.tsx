import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

/** Avatar under a gold ring — the export's most repeated ornament — with name and contact. */
export function ProfileHeader({
  initial,
  name,
  contact,
}: {
  initial: string;
  name: string;
  contact: string;
}) {
  const { c } = useTheme();
  return (
    <>
      <View style={[styles.ring, { borderColor: c.gold }]}>
        <View style={[styles.avatar, { backgroundColor: c.accentContainer }]}>
          <Type v="numeral" tone="goldInk">
            {initial}
          </Type>
        </View>
      </View>

      <Type v="headlineLg" tone="goldInk" center style={styles.name}>
        {name}
      </Type>
      <View style={styles.locationRow}>
        <Type v="bodySm" tone="onSurfaceVariant">
          {contact}
        </Type>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    borderWidth: 3,
    padding: 4,
    marginTop: Space.sm,
  },
  avatar: {
    flex: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { marginTop: Space.md },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
});
