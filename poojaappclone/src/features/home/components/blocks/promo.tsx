import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { API_URL } from '@/constants/config';
import { assetUrl } from '@/providers/content';

import { rewriteUploads, wrapHtml } from '../../lib/html';
import { inlineItems, propStr, propText } from '../../lib/layout';
import type { HomeSlide } from '../../types';
import { Frame } from '../Frame';
import { SlideCard } from '../SlideCard';
import { type BlockProps, useBlock } from './use-block';

/**
 * One banner or one HTML card. `kind: html` shows `props.html` (already
 * sanitised by the API) in the same JS-off WebView the slider uses; otherwise
 * the block's single inline item is a banner, tapped to its link.
 */
export function PromoBlock({ block }: BlockProps) {
  const { hi, flags, open, href, title, subtitle, linkLabel } = useBlock(block);
  const { width } = useWindowDimensions();

  const slide = useMemo<HomeSlide | null>(() => {
    const html = propText(block, 'html', hi);
    if (propStr(block, 'kind') === 'html') {
      if (!html) return null;
      return { id: block.id, kind: 'html', tag: '', title, sub: '', cta: '', href, html: wrapHtml(rewriteUploads(html, API_URL), API_URL) };
    }
    const first = inlineItems(block, flags, hi)[0];
    if (!first) return null;
    return {
      id: block.id,
      kind: 'banner',
      tag: '',
      title: first.title || title,
      sub: first.subtitle || subtitle,
      cta: linkLabel,
      href: first.href || href,
      image: assetUrl(first.image),
    };
  }, [block, hi, flags, href, title, subtitle, linkLabel]);

  if (!slide) return null;
  return (
    <Frame>
      <SlideCard slide={slide} width={width - 32} onPress={slide.href ? () => void open(slide.href) : undefined} />
    </Frame>
  );
}
