import { useLanguage } from '@/i18n';
import { useAdmin } from '@/providers/admin';

import { useGo } from '../../hooks/use-go';
import { useOpenHref } from '../../hooks/use-open-href';
import { blockHref, blockText } from '../../lib/layout';
import type { LayoutBlock } from '../../lib/layout-types';

/**
 * What nearly every block needs: the language, the flags, the block's own
 * localised title / link text, and `follow()` — the block's action through the
 * one safe opener, falling back to the type's natural destination when the
 * operator set none (or set one the app refuses).
 */
export function useBlock(block: LayoutBlock) {
  const { t, lang } = useLanguage();
  const { flags } = useAdmin();
  const go = useGo();
  const open = useOpenHref();
  const hi = lang === 'hi';
  const href = blockHref(block);

  return {
    t,
    lang,
    hi,
    flags,
    go,
    open,
    href,
    title: blockText(block, 'title', hi),
    subtitle: blockText(block, 'subtitle', hi),
    linkLabel: blockText(block, 'actionLabel', hi),
    /** Follow the block's action; with none usable, go to `fallback`. */
    follow: (fallback: string) => {
      if (!open(href)) go(fallback);
    },
  };
}

export type BlockProps = { block: LayoutBlock };
