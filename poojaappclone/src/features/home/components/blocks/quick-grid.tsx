import { useMemo } from 'react';

import { useAnyLive } from '@/features/darshan';

import { inlineItems, propNum } from '../../lib/layout';
import { toIconName } from '../../lib/icons';
import { Frame } from '../Frame';
import { QuickGrid, type QuickItem } from '../QuickGrid';
import { type BlockProps, useBlock } from './use-block';

/** Icon tiles from inline items. `liveBadge` shows LIVE only while some darshan stream really is live. */
export function QuickGridBlock({ block }: BlockProps) {
  const { t, hi, flags, open } = useBlock(block);
  const anyLive = useAnyLive();
  const columns = propNum(block, 'columns', 4, 3, 4) === 3 ? 3 : 4;

  const items = useMemo<(QuickItem & { href: string })[]>(
    () =>
      inlineItems(block, flags, hi).map((i) => ({
        key: i.key,
        label: i.title,
        icon: toIconName(i.icon),
        image: i.image || undefined,
        href: i.href,
        badge: i.liveBadge ? (anyLive ? t('hv_live') : undefined) : i.badge === 'new' ? t('hv_badge_new') : i.badge === 'soon' ? t('hv_badge_soon') : i.badge === 'special' ? t('hv_badge_special') : undefined,
      })),
    [block, flags, hi, anyLive, t],
  );

  if (!items.length) return null;
  return (
    <Frame>
      <QuickGrid items={items} columns={columns} onOpen={(href) => void open(href)} />
    </Frame>
  );
}
