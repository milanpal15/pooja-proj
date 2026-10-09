import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';

import { BottomBar, Button } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { PoojaDetail } from '@/lib/api';
import { fill } from '@/lib/format';
import { pick } from '@/lib/localized';

import { useNow } from '../hooks/use-now';
import { countdownTo } from '../lib/countdown';
import { activeSection, type SectionKey } from '../lib/sections';
import { DetailHeader } from './DetailHeader';
import { FaqList } from './FaqList';
import { Gallery } from './Gallery';
import { AboutBody, BenefitsBody, IncludedBody } from './InfoSections';
import { ProcessBody, TempleBody } from './TempleProcess';
import { PackageList } from './PackageList';
import { ReviewsBlock } from './ReviewsBlock';
import { Section } from './Section';
import { SectionTabs } from './SectionTabs';

const TAB_H = 46;

/** The scrolling detail page, its sticky tab bar and the "Choose package" CTA. */
export function DetailBody({ pooja: p, onScrolled }: { pooja: PoojaDetail; onScrolled?: (scrolled: boolean) => void }) {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const now = useNow();
  const scroll = useRef<ScrollView>(null);
  const tops = useRef<Partial<Record<SectionKey, number>>>({});
  const [active, setActive] = useState<SectionKey>('about');
  const [pkgKey, setPkgKey] = useState<string>();

  // Only sections that have content get a tab — an empty heading is worse than none.
  const present = useMemo(() => {
    const all: [SectionKey, boolean][] = [
      ['about', !!(p.about || p.aboutHi)],
      ['benefits', p.benefits.length > 0],
      ['included', p.included.length > 0],
      ['process', p.process.length > 0],
      ['temple', !!p.temple],
      ['packages', p.packages.length > 0],
      ['reviews', p.rating != null],
      ['faq', p.faqs.length > 0],
    ];
    return all.filter(([, on]) => on).map(([k]) => k);
  }, [p]);

  const label = (k: SectionKey) => t(`ps_tab_${k}` as const);
  const head = (k: SectionKey) => t(`ps_h_${k}` as const);
  const jump = (k: SectionKey) => {
    const y = tops.current[k];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - TAB_H), animated: true });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScrolled?.(e.nativeEvent.contentOffset.y > 240);
    const next = activeSection(tops.current, present, e.nativeEvent.contentOffset.y + TAB_H);
    if (next && next !== active) setActive(next);
  };

  const chosen = p.packages.find((x) => x.key === pkgKey);
  const closed = countdownTo(p.bookingClosesAt, now)?.closed ?? false;
  const onTop = (k: SectionKey) => (y: number) => {
    tops.current[k] = y;
  };
  const cta = () => {
    if (!chosen) return jump('packages');
    router.push({ pathname: '/pooja-checkout', params: { slug: p.slug, pkg: chosen.key } });
  };

  const body: Record<SectionKey, React.ReactNode> = {
    about: <AboutBody pooja={p} />,
    benefits: <BenefitsBody items={p.benefits} />,
    included: <IncludedBody items={p.included} />,
    process: <ProcessBody items={p.process} />,
    temple: p.temple ? <TempleBody temple={p.temple} /> : null,
    packages: <PackageList packages={p.packages} selected={pkgKey} disabled={closed} onSelect={setPkgKey} onParticipate={cta} />,
    reviews: p.rating ? <ReviewsBlock slug={p.slug} rating={p.rating} /> : null,
    faq: <FaqList faqs={p.faqs} />,
  };

  return (
    <>
      <ScrollView
        ref={scroll}
        stickyHeaderIndices={[2]}
        scrollEventThrottle={64}
        onScroll={onScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}>
        <Gallery
          images={p.gallery.length ? p.gallery : p.banner ? [p.banner] : []}
          title={pick(lang, p.title, p.titleHi)}
          tag={p.festivalName || p.tithi}
        />
        <DetailHeader pooja={p} now={now} />
        <SectionTabs items={present.map((k) => ({ key: k, label: label(k) }))} active={active} onPick={jump} />
        {present.map((k) => (
          <Section key={k} title={head(k)} bare={k === 'about'} onTop={onTop(k)}>
            {body[k]}
          </Section>
        ))}
        <View style={{ height: 8 }} />
      </ScrollView>

      <BottomBar>
        <Button
          size="lg"
          block
          disabled={closed}
          label={
            closed
              ? t('ps_closed_cta')
              : chosen
                ? fill(t('ps_continue_with'), { n: chosen.coins })
                : t('ps_choose_package')
          }
          iconRight={chosen || closed ? undefined : 'arrowRight'}
          onPress={cta}
        />
      </BottomBar>
    </>
  );
}
