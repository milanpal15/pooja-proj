import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { CircleButton, Type } from '@/components/ui';
import type { EventDetail } from '@/lib/api';
import { useLanguage } from '@/i18n';
import { pick } from '@/lib/localized';
import { Space } from '@/theme';

import { CoverTag, toneOfStatus } from './Chips';
import { CoverArt } from './CoverArt';
import { RouteFullScreen } from './route/RouteFullScreen';
import { useRouteSession } from './route/RouteSession';
import { SessionMap } from './route/SessionMap';
import type { statusLabel, themeOf } from '../lib/events-logic';

type Props = {
  event: EventDetail;
  theme: ReturnType<typeof themeOf>;
  status: { text: string; tone: ReturnType<typeof statusLabel>['tone'] };
  onBack: () => void;
};

/**
 * The event's top banner. A Yatra with a working native map shows the LIVE ROUTE MAP here (back and
 * full-screen buttons on top, tags + title on a bottom gradient); everything else is the cover picture.
 */
export function EventHero(p: Props) {
  const s = useRouteSession();
  const { t, lang } = useLanguage();
  const mapBanner = !!s && s.mode === 'map';

  const Texts = (
    <>
      <View style={styles.tags}>
        {!!p.event.typeName && <CoverTag label={(lang === 'hi' && p.event.typeNameHi ? p.event.typeNameHi : p.event.typeName).toUpperCase()} />}
        <CoverTag label={p.status.text} tone={toneOfStatus(p.status.tone)} />
      </View>
      <HeroTitle event={p.event} />
    </>
  );

  if (!s || !mapBanner) {
    return (
      <CoverArt gradient={p.theme.gradient} cover={p.event.cover} dim style={styles.hero}>
        <View style={styles.heroIn}>
          <CircleButton name="back" label={t('events')} onPress={p.onBack} />
          <View style={styles.heroText}>{Texts}</View>
        </View>
      </CoverArt>
    );
  }

  // Layers are siblings (no clipped, rounded parent around the native map — AGENTS.md §5).
  return (
    <View style={styles.mapHero}>
      <CoverArt gradient={p.theme.gradient} cover={p.event.cover} style={StyleSheet.absoluteFill} />
      {s.host === 'banner' && <SessionMap s={s} style={StyleSheet.absoluteFill} pillStyle={styles.pill} />}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} style={styles.fade} />
      <View pointerEvents="none" style={styles.mapText}>
        {Texts}
      </View>
      <View pointerEvents="box-none" style={styles.mapTop}>
        <CircleButton name="back" label={t('events')} onPress={p.onBack} />
        <CircleButton name="expand" label={t('ev_route_fullscreen')} onPress={s.openFullscreen} />
      </View>
      <RouteFullScreen s={s} />
    </View>
  );
}

function HeroTitle({ event }: { event: EventDetail }) {
  const { lang } = useLanguage();
  return (
    <>
      <Type v="headlineMd" color="#FFFFFF">
        {pick(lang, event.title, event.titleHi)}
      </Type>
      {!!event.summary && (
        <Type v="bodySm" color="rgba(255,255,255,0.92)">
          {pick(lang, event.summary, event.summaryHi)}
        </Type>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  hero: { height: 250 },
  heroIn: { flex: 1, padding: Space.margin, paddingTop: Space.xl, justifyContent: 'space-between' },
  heroText: { gap: 6 },
  tags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  mapHero: { height: 310 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 170 },
  mapText: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 6, paddingHorizontal: Space.margin, paddingBottom: Space.md },
  mapTop: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', padding: Space.margin, paddingTop: Space.xl },
  // Left of the full-screen button (44 px + gutters), so the two never overlap on a 320 dp phone.
  pill: { top: Space.xl + 4, right: Space.margin + 44 + 8 },
});
