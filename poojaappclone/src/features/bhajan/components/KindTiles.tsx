import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName, Type } from '@/components/ui';
import { type StringKey, useLanguage } from '@/i18n';
import { Space } from '@/theme';

import type { TrackKind } from '../types';

// Each kind owns a hue so the tiles tell themselves apart before they are read (the approved design).
const META: Record<TrackKind, { label: StringKey; icon: IconName; colors: [string, string] }> = {
  aarti: { label: 'bp_cat_aarti', icon: 'diya', colors: ['#6B7A22', '#4A5A12'] },
  bhajan: { label: 'bp_cat_bhajan', icon: 'music', colors: ['#8A4FB0', '#5A2A80'] },
  chalisa: { label: 'bp_cat_chalisa', icon: 'lotus', colors: ['#E2744A', '#B8421A'] },
  mantra: { label: 'bp_cat_mantra', icon: 'sparkle', colors: ['#C2185B', '#8E0E3F'] },
  paath: { label: 'bp_cat_paath', icon: 'shankh', colors: ['#2E6FA8', '#1A4A80'] },
};

/** Aarti / Bhajan / Chalisa / Mantra / Paath tiles. Tap to filter, tap again to clear. */
export function KindTiles({
  kinds,
  value,
  onPick,
}: {
  kinds: TrackKind[];
  value: TrackKind | '';
  onPick: (k: TrackKind) => void;
}) {
  const { t } = useLanguage();
  if (kinds.length === 0) return null;
  return (
    <>
      {kinds.map((k) => {
        const on = value === k;
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(k)}
            style={styles.cell}>
            <LinearGradient
              colors={META[k].colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.tile, on && styles.on]}>
              <View style={styles.disc}>
                <Icon name={META[k].icon} size={20} color="#FFFFFF" />
              </View>
              <Type v="titleMd" color="#FFFFFF" style={{ fontSize: 18 }}>
                {t(META[k].label)}
              </Type>
            </LinearGradient>
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  cell: { width: '48.5%' },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 4,
    height: 84,
    paddingHorizontal: Space.md,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  on: { borderColor: '#F6C46B' },
  disc: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
});
