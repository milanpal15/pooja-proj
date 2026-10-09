import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share } from 'react-native';

import { Screen } from '@/components/ui';
import { AsyncState } from '@/components/ui/async-state';
import { useLanguage } from '@/i18n';
import { fill } from '@/lib/format';
import { pick } from '@/lib/localized';

import { DetailBody } from './components/DetailBody';
import { DetailTopBar } from './components/DetailTopBar';
import { usePoojaDetail } from './hooks/use-pooja-detail';

/** One pooja: gallery, countdown, sections, packages and the CTA into checkout. */
export function PoojaDetailScreen() {
  const { t, lang } = useLanguage();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const m = usePoojaDetail(String(slug ?? ''));
  const p = m.data;
  const [scrolled, setScrolled] = useState(false);

  const share = () => {
    if (!p) return;
    // Platform share sheet; text only — no invented store/web link.
    Share.share({
      message: fill(t('ps_share_msg'), { title: pick(lang, p.title, p.titleHi), temple: p.templeName }),
    }).catch(() => {});
  };

  return (
    <Screen tabBar={false}>
      <DetailTopBar title={p ? pick(lang, p.title, p.titleHi) : undefined} scrolled={scrolled} onShare={share} />
      <AsyncState status={m.status} hasData={!!p} onRetry={m.reload} skeletonHeight={220}>
        {p ? <DetailBody pooja={p} onScrolled={setScrolled} /> : null}
      </AsyncState>
    </Screen>
  );
}
