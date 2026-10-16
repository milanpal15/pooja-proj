import { useMemo } from 'react';

import { assetUrl } from '@/providers/content';

import { useSource } from '../../hooks/use-sources';
import { inlineItems, sourceLimit, sourceParams } from '../../lib/layout';
import type { HomeSlide } from '../../types';
import { Frame } from '../Frame';
import { HomeSlider } from '../HomeSlider';
import { type BlockProps, useBlock } from './use-block';

function View({ slides }: { slides: HomeSlide[] }) {
  if (!slides.length) return null;
  return (
    <Frame>
      <HomeSlider slides={slides} />
    </Frame>
  );
}

/** Source `hero` (the managed Home slider) or inline items (image + title + subtitle + action). */
function SourceSlider({ block }: BlockProps) {
  const feed = useSource('hero', { params: sourceParams(block), limit: sourceLimit(block) });
  return <View slides={feed.data} />;
}

function InlineSlider({ block }: BlockProps) {
  const { hi, flags } = useBlock(block);
  const slides = useMemo<HomeSlide[]>(
    () =>
      inlineItems(block, flags, hi).map((i) => ({
        id: i.key,
        kind: 'banner',
        tag: '',
        title: i.title,
        sub: i.subtitle,
        cta: '',
        href: i.href,
        image: assetUrl(i.image),
      })),
    [block, flags, hi],
  );
  return <View slides={slides} />;
}

export function SliderBlock({ block }: BlockProps) {
  return block.data?.mode === 'inline' ? <InlineSlider block={block} /> : <SourceSlider block={block} />;
}
