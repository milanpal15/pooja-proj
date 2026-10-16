import type { ComponentType } from 'react';

import type { BlockType } from '../../lib/block-meta';
import { AstrologerBlock } from './astrologer';
import { DailyBlock } from './daily';
import { DeityRowBlock } from './deity-row';
import { EventsBlock } from './events';
import { FabBlock } from './fab';
import { FeaturedPoojaBlock } from './featured-pooja';
import { HeaderBlock } from './header';
import { HtmlBlock } from './html';
import { ListenBlock } from './listen';
import { NextSevaBlock } from './next-seva';
import { PanchangBlock } from './panchang';
import { PromoBlock } from './promo';
import { QuickGridBlock } from './quick-grid';
import { RashiRowBlock } from './rashi-row';
import { SearchBlock } from './search';
import { ShareBlock } from './share';
import { ShelfBlock } from './shelf';
import { SliderBlock } from './slider';
import { SpacerBlock } from './spacer';
import { TemplesNearBlock } from './temples-near';
import type { BlockProps } from './use-block';

/**
 * THE REGISTRY (docs/HOME_LAYOUT.md §2): block type -> component. Typed over
 * `BlockType`, so a type declared in `lib/block-meta.ts` without a component
 * (or the reverse) does not compile. A type the app has not heard of is simply
 * absent here and is skipped by the layout filter.
 */
export const BLOCKS: Record<BlockType, ComponentType<BlockProps>> = {
  header: HeaderBlock,
  search: SearchBlock,
  slider: SliderBlock,
  quick_grid: QuickGridBlock,
  shelf: ShelfBlock,
  deity_row: DeityRowBlock,
  promo: PromoBlock,
  astrologer: AstrologerBlock,
  featured_pooja: FeaturedPoojaBlock,
  daily: DailyBlock,
  panchang: PanchangBlock,
  rashi_row: RashiRowBlock,
  temples_near: TemplesNearBlock,
  next_seva: NextSevaBlock,
  listen: ListenBlock,
  events: EventsBlock,
  share: ShareBlock,
  html: HtmlBlock,
  spacer: SpacerBlock,
  fab: FabBlock,
};
