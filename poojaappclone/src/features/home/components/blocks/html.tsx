import { useMemo } from 'react';
import { View } from 'react-native';

import { API_URL } from '@/constants/config';

import { rewriteUploads, wrapHtml } from '../../lib/html';
import { propNum, propText } from '../../lib/layout';
import type { HomeSlide } from '../../types';
import { Frame } from '../Frame';
import { HeroHtmlSlide } from '../HeroHtmlSlide';
import { SLIDE_H } from '../SlideCard';
import { type BlockProps, useBlock } from './use-block';

/** Free HTML from the dashboard (sanitised on save and on read), shown the one safe way: JS off, CSP, taps routed by us. */
export function HtmlBlock({ block }: BlockProps) {
  const { hi, title } = useBlock(block);
  const html = propText(block, 'html', hi);
  const height = propNum(block, 'height', SLIDE_H, 60, 600);

  const slide = useMemo<HomeSlide | null>(
    () => (html ? { id: block.id, kind: 'html', tag: '', title, sub: '', cta: '', href: '', html: wrapHtml(rewriteUploads(html, API_URL), API_URL) } : null),
    [html, block.id, title],
  );

  if (!slide) return null;
  return (
    <Frame>
      <View style={{ height }}>
        <HeroHtmlSlide slide={slide} />
      </View>
    </Frame>
  );
}
