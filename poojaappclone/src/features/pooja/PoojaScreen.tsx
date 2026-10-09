import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeityStrip } from '@/components/illustrations/deity-strip';
import { HangingBell, Toran } from '@/components/illustrations/temple-scene';
import { NoContent } from '@/components/ui';
import { AARTI_CIRCLES } from '@/constants/deities';
import { useLanguage } from '@/i18n';
import { TopTabInset } from '@/theme';

import { AartiProgress } from './components/AartiProgress';
import { AartiThali } from './components/AartiThali';
import { MusicToggle } from './components/MusicToggle';
import { PoojaAppBar } from './components/PoojaAppBar';
import { RitualRail } from './components/RitualRail';
import { SanctumScene } from './components/SanctumScene';
import { useAartiCount } from './hooks/use-aarti-count';
import { useAarti } from './hooks/use-aarti';
import { useAccountMenu } from './hooks/use-account-menu';
import { useDeitySelection } from './hooks/use-deity-selection';
import { useSanctumSound } from './hooks/use-sanctum-sound';
import { panchangLine as todaysPanchangLine } from './lib/panchang-line';

const GOLD = '#E9A417';

export function PoojaScreen() {
  const { width } = useWindowDimensions();
  const { t, lang } = useLanguage();
  const [stage, setStage] = useState({ w: width, h: 460 });
  // Flowers only fall when the flowers option is toggled on or during Auto Aarti.
  const [flowersOn, setFlowersOn] = useState(false);
  const panchangLine = useMemo(() => todaysPanchangLine(), []);

  const { totalAartis, countCompleted } = useAartiCount();
  const aarti = useAarti(stage, countCompleted);
  const { deity, selectDeity, deitySwipe, idolStyle } = useDeitySelection(aarti.resetAarti);
  const { musicOn, toggleMusic, playBell } = useSanctumSound(aarti.autoRunning, aarti.resetAarti);
  const { initial, confirmLogout } = useAccountMenu();

  const toggleFlowers = useCallback(() => setFlowersOn((on) => !on), []);
  const flowersFalling = flowersOn || aarti.autoRunning;
  const { cx, cy } = aarti.geometry;

  // All hooks have run. The sanctum needs a murti; with the dashboard empty
  // and demo content off there is none, and an invented one would be the
  // single most dishonest thing this screen could draw.
  if (!deity) {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={styles.topArea}>
          <NoContent hi={lang === 'hi'} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.topArea}>
        {/* Gold app bar */}
        <PoojaAppBar
          initial={initial}
          title={deity.title}
          totalAartis={totalAartis}
          onAvatarPress={confirmLogout}
        />

        {/* Scrolling deity selector — changes the idol below */}
        <DeityStrip selected={deity} onSelect={selectDeity} />
      </SafeAreaView>

      {/* Sanctum */}
      <View
        style={styles.sanctum}
        onLayout={(e) =>
          setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }
      >
        <SanctumScene
          stage={stage}
          deity={deity}
          progress={aarti.progress}
          geometry={aarti.geometry}
          swipe={deitySwipe}
          flowersFalling={flowersFalling}
          idolStyle={idolStyle}
          panchangLine={panchangLine}
        />

        {/* Aarti thali — the only draggable thing in the sanctum. */}
        <AartiThali
          gesture={aarti.pan}
          left={cx - 52}
          top={cy - 52}
          thaliStyle={aarti.thaliStyle}
          grabHintStyle={aarti.grabHintStyle}
        />

        <Toran width={stage.w} />
        <HangingBell side="left" ringing={aarti.autoRunning} onRing={playBell} />
        <HangingBell side="right" ringing={aarti.autoRunning} onRing={playBell} />

        {/* Ritual rail */}
        <RitualRail
          flowersOn={flowersOn}
          collectionLabel={t('collection')}
          onAuto={aarti.runAuto}
          onToggleFlowers={toggleFlowers}
          onReset={aarti.resetAarti}
        />

        {/* Music */}
        <MusicToggle musicOn={musicOn} label={musicOn ? t('stop') : t('listen')} onPress={toggleMusic} />

        {/* Aarti progress */}
        <AartiProgress
          headline={aarti.done ? t('aarti_done') : `${aarti.circles} / ${AARTI_CIRCLES} ${t('parikrama')}`}
          subline={aarti.done ? deity.mantra : t('drag_hint')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#7A5520' },
  topArea: { backgroundColor: GOLD, zIndex: 10, paddingTop: TopTabInset },
  sanctum: { flex: 1, overflow: 'hidden' },
});
