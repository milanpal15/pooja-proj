import { StyleSheet, View } from 'react-native';

import { Divider, Icon, SectionBand, Type } from '@/components/ui';
import type { Deity } from '@/constants/deities';
import { Radius, Space, useTheme } from '@/theme';

import type { Lore } from '../hooks/use-knowledge';

export function FactsSection({ hi, lore }: { hi: boolean; lore: Lore }) {
  return (
    <SectionBand title={hi ? 'परिचय' : 'At a glance'} tone="purple">
      {lore.facts.map((f, i) => (
        <View key={f.k}>
          <View style={styles.factRow}>
            <Type v="bodySm" tone="onSurfaceVariant" style={styles.factKey}>
              {hi ? f.kHi : f.k}
            </Type>
            <Type v="titleSm" style={{ flex: 1 }}>
              {hi ? f.vHi : f.v}
            </Type>
          </View>
          {i < lore.facts.length - 1 && <Divider />}
        </View>
      ))}
    </SectionBand>
  );
}

export function ScripturesSection({ hi, lore }: { hi: boolean; lore: Lore }) {
  const { c } = useTheme();
  return (
    <SectionBand title={hi ? 'पाठ एवं ग्रंथ' : 'Scriptures & Paath'} tone="gold">
      {(hi ? lore.textsHi : lore.texts).map((x) => (
        <View key={x} style={styles.listRow}>
          <Icon name="temple" size={16} color={c.gold} />
          <Type v="bodyMd" style={{ flex: 1 }}>
            {x}
          </Type>
        </View>
      ))}
    </SectionBand>
  );
}

export function FestivalsSection({ hi, lore }: { hi: boolean; lore: Lore }) {
  const { c } = useTheme();
  return (
    <SectionBand title={hi ? 'प्रमुख पर्व' : 'Major Festivals'} tone="crimson">
      <View style={styles.wrapRow}>
        {(hi ? lore.festivalsHi : lore.festivals).map((f) => (
          <View
            key={f}
            style={[styles.festChip, { backgroundColor: c.accentContainer, borderColor: c.goldHairline }]}>
            <Type v="labelMd" tone="goldInk">
              {f}
            </Type>
          </View>
        ))}
      </View>
    </SectionBand>
  );
}

export function OfferingsSection({ hi, deity }: { hi: boolean; deity: Deity }) {
  const { c } = useTheme();
  return (
    <SectionBand title={hi ? 'प्रिय अर्पण' : 'Favoured Offerings'} tone="forest">
      <View style={styles.wrapRow}>
        {deity.offerings.map((o) => (
          <View
            key={o}
            style={[styles.festChip, { backgroundColor: c.containerLow, borderColor: c.outlineVariant }]}>
            <Type v="labelMd">{o}</Type>
          </View>
        ))}
      </View>
    </SectionBand>
  );
}

const styles = StyleSheet.create({
  factRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: 9 },
  factKey: { width: 92 },

  listRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: 5 },

  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  festChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
});
