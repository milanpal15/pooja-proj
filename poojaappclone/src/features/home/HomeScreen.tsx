import { useMemo } from 'react';

import { Screen } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { useAdmin } from '@/providers/admin';

import { BlockList } from './components/BlockList';
import { BUNDLED_LAYOUT } from './constants/default-layout';
import { useAudienceSegments } from './hooks/use-audience';
import { useHomeLayout } from './hooks/use-home-layout';
import { useNow } from './hooks/use-now';
import { APP_VERSION } from './lib/app-version';
import { audienceTagsIn, selectLayout, visibleBlocks } from './lib/layout';

/**
 * Home — drawn entirely from the layout set (docs/HOME_LAYOUT.md §9): the
 * selected layout (schedule + audience) of the served one, else the last cached one, else the bundled default. Blocks are
 * filtered here (enabled, schedule, language, flags, app version) and each one
 * loads its own data only while it is on screen and omits itself when it has
 * none. Nothing in the app knows what Home "should" contain.
 */
export function HomeScreen() {
  const { lang } = useLanguage();
  const { flags } = useAdmin();
  const { layout, ready } = useHomeLayout();
  const now = useNow(60_000);

  // Audience is decided on the device, lazily: blocks with no audience draw at once,
  // gated ones (and audience-targeted layouts) appear when their segment resolves.
  const needed = useMemo(() => audienceTagsIn(layout), [layout]);
  const segments = useAudienceSegments(needed);
  const active = useMemo(() => selectLayout(layout, { now, segments }, BUNDLED_LAYOUT), [layout, now, segments]);

  const blocks = useMemo(
    () => visibleBlocks(active.blocks, { now, lang: lang === 'hi' ? 'hi' : 'en', flags, appVersion: APP_VERSION, segments }),
    [active, now, lang, flags, segments],
  );

  return <Screen watermark>{ready && <BlockList blocks={blocks} />}</Screen>;
}
