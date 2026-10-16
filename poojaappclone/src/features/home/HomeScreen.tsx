import { useMemo } from 'react';

import { Screen } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { useAdmin } from '@/providers/admin';

import { BlockList } from './components/BlockList';
import { useHomeLayout } from './hooks/use-home-layout';
import { useNow } from './hooks/use-now';
import { APP_VERSION } from './lib/app-version';
import { visibleBlocks } from './lib/layout';

/**
 * Home — drawn entirely from the layout document (docs/HOME_LAYOUT.md): the
 * served one, else the last cached one, else the bundled default. Blocks are
 * filtered here (enabled, schedule, language, flags, app version) and each one
 * loads its own data only while it is on screen and omits itself when it has
 * none. Nothing in the app knows what Home "should" contain.
 */
export function HomeScreen() {
  const { lang } = useLanguage();
  const { flags } = useAdmin();
  const { layout, ready } = useHomeLayout();
  const now = useNow(60_000);

  const blocks = useMemo(
    () => visibleBlocks(layout.blocks, { now, lang: lang === 'hi' ? 'hi' : 'en', flags, appVersion: APP_VERSION }),
    [layout, now, lang, flags],
  );

  return <Screen watermark>{ready && <BlockList blocks={blocks} />}</Screen>;
}
