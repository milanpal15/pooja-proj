import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { RemoteHomeItem, RemoteHomeSection } from '@/providers/content';

import { type ShelfEntry, useSource } from '../../hooks/use-sources';
import { SHELF_SOURCES, type SourceKey } from '../../lib/block-meta';
import { inlineItems, propStr, sourceLimit, sourceOf, sourceParams } from '../../lib/layout';
import type { LayoutBlock } from '../../lib/layout-types';
import { CustomShelf } from '../CustomShelf';
import { Frame } from '../Frame';
import { KnowledgeShelf } from '../KnowledgeShelf';
import { MINI_W, MiniCard } from '../MiniCard';
import { SectionHead } from '../SectionHead';
import { Skeleton } from '../Skeleton';
import { type BlockProps, useBlock } from './use-block';

type LayoutKind = NonNullable<RemoteHomeSection['layout']>;
const LAYOUTS: readonly LayoutKind[] = ['photo3', 'book2', 'list', 'grid4'];
const TONES = ['gold', 'purple', 'crimson', 'forest', 'maroon'] as const;

function layoutOf(block: LayoutBlock): LayoutKind {
  const v = propStr(block, 'layout');
  return (LAYOUTS as readonly string[]).includes(v) ? (v as LayoutKind) : 'photo3';
}

/**
 * One drawing for every shelf, whatever fills it:
 *  - entries that carry a price card (poojas, chadhava) in layout photo3 -> the
 *    horizontal row of cards under a plain heading;
 *  - entries that name a deity -> the "knowledge" discs in a toned band;
 *  - anything else -> the toned band with photo / book / grid / list tiles.
 * Nothing branches on the block's id or title. No entries -> nothing at all.
 */
function ShelfView({ block, entries, loading }: { block: LayoutBlock; entries: ShelfEntry[]; loading: boolean }) {
  const { hi, open, title, linkLabel, href } = useBlock(block);
  const layout = layoutOf(block);
  const tone = (TONES as readonly string[]).includes(block.tone) ? (block.tone as RemoteHomeSection['tone']) : undefined;

  const section = useMemo<RemoteHomeSection>(
    () => ({
      key: block.id,
      source: 'custom',
      title,
      tone,
      layout,
      footerLabel: href ? linkLabel : '',
      footerHref: href,
      items: entries.map((e): RemoteHomeItem => ({
        title: e.item.title,
        subtitle: e.item.subtitle,
        icon: e.item.icon,
        image: e.item.image,
        href: e.item.href,
        badge: (['new', 'soon', 'special'] as const).find((b) => b === e.item.badge) ?? '',
        deitySlug: e.item.deitySlug,
      })),
    }),
    [block.id, title, tone, layout, href, linkLabel, entries],
  );

  if (!entries.length && !loading) return null;

  if (layout === 'photo3' && entries.every((e) => e.card)) {
    return (
      <Frame>
        <View style={styles.wrap}>
          {!!title && <SectionHead title={title} link={href ? linkLabel : undefined} onLink={() => void open(href)} />}
          {entries.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {entries.map((e) => (
                <MiniCard key={e.key} {...e.card!} onPress={() => void open(e.item.href)} />
              ))}
            </ScrollView>
          ) : (
            <Skeleton style={{ height: 190, width: MINI_W }} />
          )}
        </View>
      </Frame>
    );
  }

  // Loading a band-style shelf, or a band with no title: nothing to draw yet.
  if (!title || !entries.length) return null;
  return (
    <Frame>
      {entries.every((e) => e.item.deitySlug) ? <KnowledgeShelf section={section} hi={hi} /> : <CustomShelf section={section} hi={hi} />}
    </Frame>
  );
}

function InlineShelf({ block }: BlockProps) {
  const { hi, flags } = useBlock(block);
  const entries = useMemo(() => inlineItems(block, flags, hi).map((item) => ({ key: item.key, item })), [block, flags, hi]);
  return <ShelfView block={block} entries={entries} loading={false} />;
}

function SourceShelf({ block, source }: BlockProps & { source: SourceKey }) {
  const feed = useSource(source, { params: sourceParams(block), limit: sourceLimit(block) });
  const d = feed.data as unknown;
  const entries: ShelfEntry[] = Array.isArray(d) ? (d as ShelfEntry[]) : ((d as { entries?: ShelfEntry[] } | null)?.entries ?? []);
  return <ShelfView block={block} entries={entries} loading={feed.loading} />;
}

export function ShelfBlock({ block }: BlockProps) {
  if (block.data?.mode === 'source' && (SHELF_SOURCES as readonly string[]).includes(block.data.source)) {
    return <SourceShelf block={block} source={sourceOf(block, SHELF_SOURCES)} />;
  }
  return <InlineShelf block={block} />;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { gap: 12, paddingRight: 4 },
});
