import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  ArchImage,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  Screen,
  SectionBand,
  Type,
} from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { DEITIES, deityById } from '@/constants/deities';
import { KNOWLEDGE_IDS, LORE } from '@/constants/knowledge';
import { useAdmin } from '@/context/admin';
import { useContent } from '@/context/content';
import { useLanguage } from '@/context/language';
import { Radius, Space, useTheme } from '@/theme';

/**
 * Knowledge of the Gods — the destination for the deity cards on Home.
 *
 * Those cards used to open `/pooja`, the gesture aarti, which answered a
 * question nobody asked: tapping "learn about Shiva" started a ritual instead
 * of explaining anything. This is the reading screen they were pointing at.
 *
 * It ends where a devotee would want to go next — the aarti for this deity,
 * and its scriptures — so the screen informs rather than dead-ends.
 */
export default function KnowledgeScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const { deityArt } = useContent();
  const { flags } = useAdmin();
  const hi = lang === 'hi';

  const { deity: param } = useLocalSearchParams<{ deity?: string }>();
  const [id, setId] = useState(() =>
    KNOWLEDGE_IDS.includes(param as never) ? (param as string) : 'shiva',
  );

  const deity = deityById(id);
  const lore = LORE[id];
  const art = deityArt(id);

  return (
    <Screen tabBar={false}>
      <AppBar
        title={hi ? 'देवों का ज्ञान' : 'Knowledge of the Gods'}
        subtitle={(hi ? deity.name : deity.title)?.toUpperCase()}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Switching deity keeps you on the screen rather than sending you
            back to Home to pick another one. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {KNOWLEDGE_IDS.map((k) => {
            const d = DEITIES.find((x) => x.id === k);
            return (
              <Chip
                key={k}
                label={hi ? (d?.name ?? k) : (d?.title ?? k)}
                selected={k === id}
                onPress={() => setId(k)}
              />
            );
          })}
        </ScrollView>

        {art && (
          <ArchImage source={art} height={260} fit="contain" style={{ backgroundColor: c.containerLow }}>
            <View style={[styles.wash, { backgroundColor: c.scrim }]} />
            <View style={styles.heroText}>
              <Type v="headlineLg" color="#FFFFFF" center numberOfLines={1}>
                {hi ? deity.name : deity.title}
              </Type>
              <Type v="labelMd" color="#FFFFFF" center style={{ opacity: 0.9 }}>
                {hi ? lore.epithetHi : lore.epithet}
              </Type>
            </View>
          </ArchImage>
        )}

        {/* The mantra is the reason many people open a screen like this, so it
            sits above the prose rather than buried under it. */}
        <Card variant="ornate">
          <View style={styles.mantraHead}>
            <Icon name="sparkle" size={16} color={c.gold} />
            <Type v="labelSm" tone="onSurfaceFaint">
              {hi ? 'मंत्र' : 'MANTRA'}
            </Type>
          </View>
          <Type v="mantra" tone="goldInk" center>
            {deity.mantra}
          </Type>
        </Card>

        <Card>
          <Type v="bodyMd">{hi ? lore.aboutHi : lore.about}</Type>
        </Card>

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

        {/* Where a devotee would want to go next. */}
        <View style={styles.cta}>
          {flags.virtualPooja && (
            <Button
              label={t('feat_virtual_pooja')}
              icon="diya"
              size="lg"
              block
              onPress={() => router.push({ pathname: '/pooja', params: { deity: id } })}
            />
          )}
          {flags.bhajan && (
            <Button
              label={t('feat_bhajans')}
              variant="outline"
              icon="music"
              block
              onPress={() => router.push('/bhajan')}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.md },
  chips: { gap: Space.sm, paddingVertical: 2, paddingRight: Space.sm },

  wash: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, opacity: 0.8 },
  heroText: { position: 'absolute', left: Space.md, right: Space.md, bottom: Space.md, gap: 2 },

  mantraHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },

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

  cta: { gap: Space.sm, marginTop: Space.sm },
});
