import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { SectionBand, Type } from '@/components/ui';
import { assetUrl, type RemoteHomeSection, useContent } from '@/providers/content';
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
  // Each card: the deity it names (if the dashboard has it) and/or its own picture, title and link.
  const cards = (section.items ?? []).flatMap((i) => {
    const d = i.deitySlug ? deityById(i.deitySlug) : undefined;
    const known = d && d.id === i.deitySlug ? d : undefined;
    const name = pick(hi, i.title ?? '', i.titleHi ?? '') || known?.name || '';
    if (!name && !i.image) return [];
    const own = i.image ? assetUrl(i.image) : '';
    return [{ key: `${i.deitySlug ?? ''}:${i.title ?? ''}:${i.image ?? ''}`, known, name, accent: known?.accent ?? '#8A4B06', source: own ? { uri: own } : known ? deityArt(known.id) : undefined, href: i.href || '' }];
  });
  if (!cards.length) return null;

  return (
    <SectionBand
      title={sectionTitle(section, hi)}
      tone={section.tone}
      footerLabel={sectionFooter(section, hi) || undefined}
      onFooter={() => router.push((section.footerHref || '/knowledge') as never)}>
      <View style={styles.row}>
        {cards.map((d) => {
          const lore = d.known ? knowledge.find((k) => k.deitySlug === d.known!.id) : undefined;
          return (
            <Pressable
              key={d.key}
              accessibilityRole="button"
              onPress={() => router.push((d.href && d.href.startsWith('/') ? d.href : d.known ? { pathname: '/knowledge', params: { deity: d.known.id } } : '/knowledge') as never)}
              style={styles.cell}>
              {d.source ? (
                <Image source={d.source} style={styles.disc} resizeMode="cover" />
              ) : (
                <View style={[styles.disc, { backgroundColor: d.accent, alignItems: 'center', justifyContent: 'center' }]}>
                  <Type v="titleMd" color="#FFFFFF">
                    {Array.from(d.name || '•')[0]}
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
