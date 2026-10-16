import { useMemo } from 'react';

import { fill } from '@/lib/format';

import { useSource } from '../../hooks/use-sources';
import { sourceLimit, sourceParams } from '../../lib/layout';
import { Frame } from '../Frame';
import { ListenCard, type ListenChip } from '../ListenCard';
import { type BlockProps, useBlock } from './use-block';

const CATS: { key: string; label: 'hv_cat_morning' | 'hv_cat_evening' | 'hv_cat_meditation'; icon: ListenChip['icon'] }[] = [
  { key: 'morning', label: 'hv_cat_morning', icon: 'sparkle' },
  { key: 'evening', label: 'hv_cat_evening', icon: 'diya' },
  { key: 'meditation', label: 'hv_cat_meditation', icon: 'lotus' },
];

/**
 * "Listen now" from the dashboard's bhajans: a chip for each shelf that has
 * tracks, and the first playable track. Omitted when there are no tracks.
 * (Playback itself lives in the Bhajan tab — tapping hands off to it.)
 */
export function ListenBlock({ block }: BlockProps) {
  const { t, title, linkLabel, follow } = useBlock(block);
  const feed = useSource('bhajans.featured', { params: sourceParams(block), limit: sourceLimit(block) });
  const aartis = feed.data.aartis;

  const { chips, track } = useMemo(() => {
    const have = new Set(aartis.map((a) => (a.category ?? '').toLowerCase()));
    return {
      chips: CATS.filter((c) => have.has(c.key)).map((c) => ({ key: c.key, label: t(c.label), icon: c.icon })),
      track: aartis.find((a) => a.audioUrl) ?? aartis[0],
    };
  }, [aartis, t]);

  if (!track) return null;
  return (
    <Frame>
      <ListenCard
        title={title || t('hv_listen')}
        link={linkLabel || t('hv_collection')}
        chips={chips}
        track={{ id: track._id, title: track.title, artist: track.artist ?? '', len: track.duration ?? '' }}
        playLabel={fill(t('hv_play'), { title: track.title })}
        onOpen={() => follow('/bhajan')}
      />
    </Frame>
  );
}
