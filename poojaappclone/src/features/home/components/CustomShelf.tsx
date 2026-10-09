import { StyleSheet, View } from 'react-native';

import { SectionBand } from '@/components/ui';
import type { RemoteHomeSection } from '@/providers/content';

import { useItemPress } from '../hooks/use-item-press';
import { useOpenHref } from '../hooks/use-open-href';
import { chunk } from '../lib/sections';
import { BookTile, ListItem, PhotoTile } from './ShelfTiles';
import { sectionFooter, sectionTitle } from './section-text';

/**
 * A dashboard-authored shelf. `layout` picks the tile shape: photo3 (three
 * across), book2 / grid4 (rows of two / four), list (rows). The band colour is
 * the section's `tone`.
 */
export function CustomShelf({ section, hi }: { section: RemoteHomeSection; hi: boolean }) {
  const press = useItemPress();
  const open = useOpenHref();
  const items = section.items ?? [];
  const layout = section.layout ?? 'list';
  const per = layout === 'photo3' ? 3 : layout === 'book2' ? 2 : layout === 'grid4' ? 4 : 1;
  const Tile = layout === 'photo3' ? PhotoTile : layout === 'list' ? ListItem : BookTile;

  return (
    <SectionBand
      title={sectionTitle(section, hi)}
      tone={section.tone}
      footerLabel={sectionFooter(section, hi) || undefined}
      onFooter={() => void open(section.footerHref)}>
      {chunk(items, per).map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((it, i) => (
            <Tile key={i} item={it} hi={hi} onPress={press} />
          ))}
          {/* Pad a short last row so its tiles keep the same width. */}
          {row.length < per && layout !== 'list' && Array.from({ length: per - row.length }, (_, k) => <View key={`p${k}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </SectionBand>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 } });
