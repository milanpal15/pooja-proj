import { useMemo } from 'react';

import { ADMIN_API } from '@/constants/config';
import { useLanguage } from '@/i18n';
import { assetUrl, useContent } from '@/providers/content';

import { FALLBACK_SLIDE_ID } from '../constants/fallback';
import { rewriteUploads, wrapHtml } from '../lib/html';
import { toSlides, visibleSlides } from '../lib/slides';
import type { HomeSlide } from '../types';
import { useNow } from './use-now';

/**
 * The slider's slides: the dashboard's, filtered to enabled + in-window + this
 * language and re-checked each minute. Empty means the block is omitted.
 *
 * The single neutral text slide appears ONLY when the app has no content at
 * all (API unreachable and nothing cached) — otherwise an empty slider is a
 * deliberate empty slider.
 */
export function useHomeSlides(): HomeSlide[] {
  const { hero, deities, temples, loading } = useContent();
  const { lang, t } = useLanguage();
  const now = useNow(60_000);
  const hi = lang === 'hi';

  return useMemo(() => {
    const slides = toSlides(visibleSlides(hero, hi ? 'hi' : 'en', now), hi, {
      image: assetUrl,
      html: (h) => wrapHtml(rewriteUploads(h, ADMIN_API), ADMIN_API),
    });
    const nothingAtAll = !loading && !hero.length && !deities.length && !temples.length;
    if (!slides.length && nothingAtAll) {
      return [{ id: FALLBACK_SLIDE_ID, kind: 'banner', tag: '', title: t('hv_fb_title'), sub: t('hv_fb_sub'), cta: '', href: '' }];
    }
    return slides;
  }, [hero, hi, now, deities.length, temples.length, loading, t]);
}
