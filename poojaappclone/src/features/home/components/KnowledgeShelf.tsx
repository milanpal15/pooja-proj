import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { SectionBand, Type } from '@/components/ui';
import { type RemoteHomeSection, useContent } from '@/providers/content';
import { useTheme } from '@/theme';

import { pick } from '../lib/pick';
import { sectionFooter, sectionTitle } from './section-text';

/**
 * "Knowledge of the Gods": the deities the section names, drawn with the
 * dashboard's artwork (or a lettered disc) and epithet; each opens its lore.
 * A named deity the dashboard does not have is skipped.
 */
export function KnowledgeShelf({ section, hi }: { section: RemoteHomeSection; hi: boolean }) {
  const router = useRouter();
  const { c } = useTheme();
  const { deityById, deityArt, knowledge } = useContent();
  const deities = (section.items ?? []).flatMap((i) => {
    const d = i.deitySlug ? deityById(i.deitySlug) : undefined;
    return d && d.id === i.deitySlug ? [d] : [];
  });
  if (!deities.length) return null;

  return (
    <SectionBand
      title={sectionTitle(section, hi)}
      tone={section.tone}
      footerLabel={sectionFooter(section, hi) || undefined}
      onFooter={() => router.push((section.footerHref || '/knowledge') as never)}>
      <View style={styles.row}>
        {deities.map((d) => {
          const art = deityArt(d.id);
          const lore = knowledge.find((k) => k.deitySlug === d.id);
          return (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/knowledge', params: { deity: d.id } } as never)}
              style={styles.cell}>
              {art ? (
                <Image source={art} style={styles.disc} resizeMode="cover" />
              ) : (
                <View style={[styles.disc, { backgroundColor: d.accent, alignItems: 'center', justifyContent: 'center' }]}>
                  <Type v="titleMd" color="#FFFFFF">
                    {Array.from(d.name)[0]}
                  </Type>
                </View>
              )}
              <Type v="titleSm" center numberOfLines={1}>
                {d.name}
              </Type>
              {!!lore?.epithet && (
                <Type v="labelSm" center numberOfLines={2} style={{ color: c.onSurfaceVariant }}>
                  {pick(hi, lore.epithet, lore.epithetHi)}
                </Type>
              )}
            </Pressable>
          );
        })}
      </View>
    </SectionBand>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, alignItems: 'center', gap: 4 },
  disc: { width: 72, height: 72, borderRadius: 36 },
});
