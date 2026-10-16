import { EventsTeaser, useMyEventsTeaser, useUpcomingEventsTeaser } from '@/features/events';

import { paramList, sourceLimit, sourceOf, sourceParams } from '../../lib/layout';
import type { LayoutBlock } from '../../lib/layout-types';
import { Frame } from '../Frame';
import { type BlockProps, useBlock } from './use-block';

const SOURCES = ['events.mine', 'events.upcoming'] as const;

function Teaser({ block, feed, joined }: { block: LayoutBlock; feed: ReturnType<typeof useMyEventsTeaser>; joined: boolean }) {
  const { t, title, linkLabel, follow } = useBlock(block);
  if (!feed.cards.length) return null;
  return (
    <Frame>
      <EventsTeaser
        cards={feed.cards}
        types={feed.types}
        joined={joined}
        title={title || t('events')}
        link={linkLabel || t('hv_see_all')}
        onLink={() => follow('/events')}
      />
    </Frame>
  );
}

const MAX = 2;

function MineTeaser({ block }: BlockProps) {
  const feed = useMyEventsTeaser(sourceLimit(block) ?? MAX, paramList(sourceParams(block), 'tags'));
  return <Teaser block={block} feed={feed} joined />;
}

function UpcomingTeaser({ block }: BlockProps) {
  const feed = useUpcomingEventsTeaser(sourceLimit(block) ?? MAX, paramList(sourceParams(block), 'tags'));
  return <Teaser block={block} feed={feed} joined={false} />;
}

/** A teaser of the devotee's own events (`events.mine`) or the upcoming ones (`events.upcoming`). */
export function EventsBlock({ block }: BlockProps) {
  return sourceOf(block, SOURCES) === 'events.mine' ? <MineTeaser block={block} /> : <UpcomingTeaser block={block} />;
}
