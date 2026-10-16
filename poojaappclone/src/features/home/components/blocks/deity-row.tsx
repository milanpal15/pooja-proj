import { useMemo } from 'react';

import { useContent, assetUrl } from '@/providers/content';

import { useGo } from '../../hooks/use-go';
import { useOpenHref } from '../../hooks/use-open-href';
import { useSource } from '../../hooks/use-sources';
import { inlineItems, sourceLimit, sourceParams } from '../../lib/layout';
import { DeityRow, type DeityEntry } from '../DeityRow';
import { Frame } from '../Frame';
import { type BlockProps, useBlock } from './use-block';

const FALLBACK_ACCENT = '#8A4B06';

function Row({ entries }: { entries: DeityEntry[] }) {
  const go = useGo();
  const open = useOpenHref();
  if (!entries.length) return null;
  return (
    <Frame>
      <DeityRow
        entries={entries}
        // A card the operator gave its own link opens that; otherwise the deity's pooja list.
        onPick={(e) => {
          if (e.href && open(e.href)) return;
          go(`/pooja?deity=${encodeURIComponent(e.id)}&ts=${Date.now()}`);
        }}
      />
    </Frame>
  );
}

function SourceRow({ block }: BlockProps) {
  const { deityArt } = useContent();
  const feed = useSource('deities', { params: sourceParams(block), limit: sourceLimit(block) });
  const entries = useMemo<DeityEntry[]>(() => feed.data.map((d) => ({ id: d.id, name: d.name, accent: d.accent, source: deityArt(d.id) })), [feed.data, deityArt]);
  return <Row entries={entries} />;
}

/**
 * Inline: each card is an avatar. Its own uploaded `image` wins; else the dashboard's artwork for the deity it
 * names (`deitySlug`); else a lettered disc. A card needs a title or a known deity, and may have its own link.
 */
function InlineRow({ block }: BlockProps) {
  const { hi, flags } = useBlock(block);
  const { deityById, deityArt } = useContent();
  const entries = useMemo<DeityEntry[]>(
    () =>
      inlineItems(block, flags, hi).flatMap((i): DeityEntry[] => {
        const d = i.deitySlug ? deityById(i.deitySlug) : undefined;
        const known = d && d.id === i.deitySlug ? d : undefined;
        const name = i.title || known?.name || '';
        if (!name) return [];
        const own = i.image ? assetUrl(i.image) : '';
        return [
          {
            id: known?.id ?? i.key,
            name,
            accent: known?.accent ?? FALLBACK_ACCENT,
            source: own ? { uri: own } : known ? deityArt(known.id) : undefined,
            href: i.href || undefined,
          },
        ];
      }),
    [block, flags, hi, deityById, deityArt],
  );
  return <Row entries={entries} />;
}

export function DeityRowBlock({ block }: BlockProps) {
  return block.data?.mode === 'inline' ? <InlineRow block={block} /> : <SourceRow block={block} />;
}
