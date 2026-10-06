import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeityIdol } from '@/components/mandir/deity-idol';
import { DeityStrip } from '@/components/mandir/deity-strip';
import { Marigold, MarigoldRain } from '@/components/mandir/marigold';
import { HangingBell, TempleBackdrop, Toran } from '@/components/mandir/temple-scene';
import { Thali } from '@/components/mandir/thali';
import { Flame } from '@/components/pooja/flame';
import { AARTI_CIRCLES, type Deity } from '@/constants/deities';
import { BottomTabInset, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useLanguage } from '@/context/language';
import { useContent } from '@/context/content';
import { NoContent } from '@/components/ui';
import { computePanchang, DEFAULT_PLACE } from '@/lib/panchang';

const TWO_PI = Math.PI * 2;
/** Resting spot: bottom of the circle, in screen coords where +y points down. */
const ANGLE_REST = Math.PI / 2;
const TOTAL = TWO_PI * AARTI_CIRCLES;
/** Firm, non-bouncy return so the thali settles home without dangling. */
const RETURN_SPRING = { damping: 22, stiffness: 180, overshootClamping: true } as const;

/** Nearest angle congruent to ANGLE_REST, so the thali returns the short way. */
function nearestRest(current: number) {
  'worklet';
  return ANGLE_REST + Math.round((current - ANGLE_REST) / TWO_PI) * TWO_PI;
}

export default function MandirScreen() {
  const { width } = useWindowDimensions();
  // The sanctum draws whatever the dashboard publishes. With nothing
  // published there is no murti to perform an aarti to, and the screen says
  // so rather than inventing one.
  const { deityById, deityList, toneSound } = useContent();

  /*
   * The real panchang for today.
   *
   * This banner printed a fixed string — '॥ सोमवार, आषाढ़, त्रयोदशी ॥' —
   * under the murti on every screen, every day, regardless of the date. It
   * is computed on device from the same library the Panchang screen uses,
   * so the two can no longer disagree.
   */
  const panchangLine = useMemo(() => {
    try {
      const p = computePanchang(new Date(), DEFAULT_PLACE.lat, DEFAULT_PLACE.lng);
      return `॥ ${p.varaHi}, ${p.masaHi}, ${p.tithiHi} ॥`;
    } catch {
      // An ephemeris failure must not take the sanctum down; drop the line.
      return '';
    }
  }, []);
  // A deity id passed from the Temples tab ("Perform Pooja") preselects the murti.
  // `ts` is a per-navigation nonce so the same deity still restarts the aarti.
  const { deity: deityParam, ts } = useLocalSearchParams<{ deity?: string; ts?: string }>();
  const [deity, setDeity] = useState<Deity | undefined>(() => deityById(deityParam));
  const [stage, setStage] = useState({ w: width, h: 460 });
  const [circles, setCircles] = useState(0);
  const [done, setDone] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  // Flowers only fall when the flowers option is toggled on or during Auto Aarti.
  const [flowersOn, setFlowersOn] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  // Persisted total aarti completion count (the "coin" counter).
  const [totalAartis, setTotalAartis] = useState(0);

  /*
   * The ghanta and the aarti ambience, both from the dashboard's tone list.
   *
   * These were two files compiled into the app, which meant the temple could
   * not change what its own sanctum sounds like without a store release.
   * Both players no-op safely while the tone has no audio uploaded yet —
   * `useAudioPlayer` keys on the source, so they pick it up once it arrives.
   */
  const bellSound = useAudioPlayer(toneSound('bell'));
  const aartiSound = useAudioPlayer(toneSound('aarti'));

  // Geometry of the aarti orbit, derived from the measured sanctum.
  const cx = stage.w / 2;
  const cy = stage.h * 0.44;
  const rRest = Math.min(stage.w, stage.h) * 0.34;
  const rMin = rRest * 0.7;
  const rMax = rRest * 1.32;

  /** Total rotation carried so far — the single source of truth for progress. */
  const turned = useSharedValue(0);
  const dragAngle = useSharedValue(ANGLE_REST);
  const lastAngle = useSharedValue(ANGLE_REST);
  const radius = useSharedValue(rRest);
  const held = useSharedValue(0);
  const auto = useSharedValue(0);
  const autoBase = useSharedValue(0);
  /** Thali offset from the orbit centre at the moment the drag began. */
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
  /** Drives the "grab me" pulse around the plate. */
  const pulse = useSharedValue(0);
  /** Drives the cross-fade when the selected deity changes. */
  const swap = useSharedValue(1);
  /** Direction of the last deity change (+1 swipe up / next, -1 down / prev). */
  const swapDir = useSharedValue(0);

  const progress = useDerivedValue(() => turned.value / TOTAL);
  const angle = useDerivedValue(() =>
    auto.value === 1 ? autoBase.value + turned.value : dragAngle.value,
  );

  // Allow playback even when the phone is on silent (esp. iOS).
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Load the persisted aarti counter on mount.
  useEffect(() => {
    AsyncStorage.getItem('pooja.totalAartis')
      .then((raw) => { if (raw) setTotalAartis(parseInt(raw, 10) || 0); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    radius.value = withSpring(rRest);
  }, [rRest, radius]);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [pulse]);

  // Swap animation whenever the strip selection changes.
  useEffect(() => {
    swap.value = 0;
    swap.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [deity?.id, swap]);

  const onCircles = useCallback((n: number) => {
    setCircles(Math.min(n, AARTI_CIRCLES));
    if (n >= AARTI_CIRCLES) {
      setDone(true);
      // Increment and persist the aarti completion counter.
      setTotalAartis((prev) => {
        const next = prev + 1;
        AsyncStorage.setItem('pooja.totalAartis', String(next)).catch(() => {});
        return next;
      });
    }
  }, []);

  useAnimatedReaction(
    () => Math.floor(turned.value / TWO_PI),
    (cur, prev) => {
      if (prev !== null && cur !== prev) runOnJS(onCircles)(cur);
    },
  );

  const finishAuto = useCallback(() => setAutoRunning(false), []);

  const runAuto = useCallback(() => {
    if (autoRunning) return;
    setAutoRunning(true);

    // Restarting after a finished aarti.
    //
    // The previous attempt wrote `turned.value = 0` and then started the
    // timing in the same tick. Reanimated commits those writes together, so
    // the animation captured TOTAL as its start value and ran its full
    // duration without moving the thali — the button looked dead. A sequence
    // snaps to the start ON THE UI THREAD before animating, which is the only
    // way to be sure the reset lands first.
    const restarting = done;
    if (restarting) {
      setCircles(0);
      setDone(false);
    }

    const from = restarting ? 0 : turned.value;
    const remaining = TOTAL - from;

    autoBase.value = dragAngle.value - from;
    lastAngle.value = dragAngle.value;
    auto.value = 1;

    turned.value = withSequence(
      withTiming(from, { duration: 0 }),
      withTiming(
        TOTAL,
        { duration: Math.max(700, (remaining / TWO_PI) * 2600), easing: Easing.linear },
        (finished) => {
          if (!finished) return;
          dragAngle.value = autoBase.value + TOTAL;
          auto.value = 0;
          dragAngle.value = withSpring(nearestRest(dragAngle.value), RETURN_SPRING);
          runOnJS(finishAuto)();
        },
      ),
    );
  }, [autoRunning, done, turned, dragAngle, lastAngle, auto, autoBase, finishAuto]);

  const resetAarti = useCallback(() => {
    auto.value = 0;
    turned.value = 0;
    dragAngle.value = withSpring(ANGLE_REST, RETURN_SPRING);
    lastAngle.value = ANGLE_REST;
    setCircles(0);
    setDone(false);
    setAutoRunning(false);
  }, [auto, turned, dragAngle, lastAngle]);

  const selectDeity = useCallback(
    (d: Deity) => {
      setDeity(d);
      resetAarti();
    },
    [resetAarti],
  );

  // Vertical swipe cycles the deity: flick up = next, flick down = previous.
  const changeDeity = useCallback(
    (dir: 1 | -1) => {
      if (!deityList.length) return;
      const i = deityList.findIndex((d) => d.id === deity?.id);
      const next = deityList[(i + dir + deityList.length) % deityList.length];
      swapDir.value = dir;
      selectDeity(next);
    },
    [deity?.id, deityList, selectDeity, swapDir],
  );

  // Vertical drag past a threshold changes the deity — more forgiving than a
  // fling (fires on a slow swipe too). Only activates on vertical motion, and
  // fails on horizontal so it never fights the strip or a stray tap.
  const deitySwipe = Gesture.Pan()
    .activeOffsetY([-16, 16])
    .failOffsetX([-28, 28])
    .onEnd((e) => {
      if (e.translationY <= -40 || e.velocityY < -600) runOnJS(changeDeity)(1);
      else if (e.translationY >= 40 || e.velocityY > 600) runOnJS(changeDeity)(-1);
    });

  // Re-select when arriving from Temples with a new deity param (this tab stays
  // mounted, so the initial useState value won't pick up later navigations).
  useEffect(() => {
    // Reacting to a route-param change is a legitimate effect-driven update.
    // `ts` in the deps makes every "Perform Pooja" restart, even for same deity.
    const next = deityById(deityParam);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (deityParam && next) selectDeity(next);
  }, [deityParam, ts, selectDeity, deityById]);

  /**
   * The thali can only be picked up by touching the thali itself, so this
   * gesture lives on the plate rather than on the sanctum.
   *
   * It works purely from the gesture's translation — the offset of the thali
   * from the orbit centre when the drag began, plus how far the finger has
   * moved. That keeps it independent of which view the gesture is attached to,
   * and it means the plate never jumps to sit under the fingertip.
   */
  const pan = Gesture.Pan()
    .hitSlop({ top: 14, bottom: 14, left: 14, right: 14 })
    .onBegin(() => {
      if (auto.value === 1) return;
      held.value = withTiming(1, { duration: 140 });
      grabX.value = Math.cos(dragAngle.value) * radius.value;
      grabY.value = Math.sin(dragAngle.value) * radius.value;
      lastAngle.value = dragAngle.value;
    })
    .onUpdate((e) => {
      if (auto.value === 1) return;
      const nx = grabX.value + e.translationX;
      const ny = grabY.value + e.translationY;
      const a = Math.atan2(ny, nx);
      let d = a - lastAngle.value;
      if (d > Math.PI) d -= TWO_PI;
      if (d < -Math.PI) d += TWO_PI;
      // Traditional aarti is clockwise, so only forward motion counts.
      if (d > 0) turned.value = Math.min(turned.value + d, TOTAL);
      lastAngle.value = a;
      dragAngle.value += d;
      radius.value = Math.min(Math.max(Math.hypot(nx, ny), rMin), rMax);
    })
    .onFinalize(() => {
      if (auto.value === 1) return;
      held.value = withTiming(0, { duration: 220 });
      // Released: glide the thali back to its resting spot below the murti.
      dragAngle.value = withSpring(nearestRest(dragAngle.value), RETURN_SPRING);
      radius.value = withSpring(rRest, RETURN_SPRING);
    });

  const thaliStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(angle.value) * radius.value },
      { translateY: Math.sin(angle.value) * radius.value },
      { scale: 1 + held.value * 0.1 },
    ],
  }));

  const idolStyle = useAnimatedStyle(() => ({
    opacity: swap.value,
    transform: [
      { scale: 0.9 + swap.value * 0.1 },
      // New murti slides in from the swipe direction as it fades in.
      { translateY: (1 - swap.value) * swapDir.value * 50 },
    ],
  }));

  // Fades out as soon as the aarti is under way — it is only a first-run nudge.
  const grabHintStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0.001 ? 0 : (1 - pulse.value) * 0.5,
    transform: [{ scale: 0.85 + pulse.value * 0.6 }],
  }));

  const toggleFlowers = useCallback(() => setFlowersOn((on) => !on), []);
  const flowersFalling = flowersOn || autoRunning;

  const { user, signOut } = useAuth();
  const { t, toggleLang, lang } = useLanguage();
  const initial = user?.name?.trim()?.[0]?.toUpperCase() || 'अ';
  const confirmLogout = useCallback(() => {
    Alert.alert(
      t('logout_title'),
      user?.name ? `${t('signed_in_as')}: ${user.name}` : undefined,
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('switch_language'), onPress: () => toggleLang() },
        { text: t('logout'), style: 'destructive', onPress: () => signOut() },
      ],
    );
  }, [user, signOut, t, toggleLang]);

  const toggleMusic = useCallback(() => setMusicOn((on) => !on), []);

  // Ring the bell sound once (used on a bell tap when not auto-ringing).
  const playBell = useCallback(() => {
    try {
      bellSound.seekTo(0);
      bellSound.play();
    } catch {
      // no source loaded yet — ignore
    }
  }, [bellSound]);

  // The Listen button is the ONLY control for the aarti track.
  //
  // It used to be `musicOn || autoRunning`, so starting an auto aarti forced
  // the music on and finishing one cut it off mid-track — pausing it by hand
  // did nothing while the aarti ran. Auto aarti still rings the bells; the
  // background track is the devotee's choice and stays that way.
  const aartiPlaying = musicOn;
  useEffect(() => {
    try {
      aartiSound.loop = true;
      aartiSound.volume = 0.8;
      if (aartiPlaying) aartiSound.play();
      else aartiSound.pause();
    } catch {
      // no source loaded yet
    }
  }, [aartiPlaying, aartiSound]);

  // Leaving the tab ends the ritual.
  //
  // Without this the aarti kept turning and the track kept playing while the
  // devotee was on another tab — audible from Bhajan, and returning showed a
  // parikrama count that had advanced with nobody watching. Blur stops the
  // sound and puts the aarti back to the start.
  useFocusEffect(
    useCallback(
      () => () => {
        setMusicOn(false);
        try {
          aartiSound.pause();
          bellSound.pause();
        } catch {
          // nothing loaded
        }
        resetAarti();
      },
      [aartiSound, bellSound, resetAarti],
    ),
  );

  // Ring the bell repeatedly through Auto Aarti (looping a short clip is
  // unreliable, so re-trigger a fresh strike on an interval instead).
  useEffect(() => {
    if (!autoRunning) return;
    playBell();
    const id = setInterval(playBell, 1500);
    return () => clearInterval(id);
  }, [autoRunning, playBell]);

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
        <View style={styles.appBar}>
          <Pressable style={styles.avatarBtn} onPress={confirmLogout}>
            <Text style={styles.avatarText}>{initial}</Text>
          </Pressable>
          <View style={styles.titlePill}>
            <Text style={styles.titleText}>{deity.title}</Text>
          </View>
          <View style={styles.coinPill}>
            <Text style={styles.coinCount}>{totalAartis}</Text>
            <View style={styles.coin}>
              <Text style={styles.coinGlyph}>ॐ</Text>
            </View>
          </View>
        </View>

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
        <TempleBackdrop width={stage.w} height={stage.h} accent={deity.accent} />

        {/* Scenery layer — also catches vertical swipes to change the deity.
            `box-only` makes it receive the swipe while its children stay inert;
            the thali/rail/bells are siblings on top and keep their own touches. */}
        <GestureDetector gesture={deitySwipe}>
          <View style={styles.stageFill} pointerEvents="box-only">
            {flowersFalling && (
              <MarigoldRain width={stage.w} height={stage.h} count={16} />
            )}

            {/* Murti, centred on the aarti orbit */}
            <Animated.View
              style={[
                styles.idolWrap,
                { top: cy - stage.h * 0.3, height: stage.h * 0.62 },
                idolStyle,
              ]}
            >
              <DeityIdol deity={deity} progress={progress} size={Math.min(stage.w * 0.72, 290)} />
            </Animated.View>

            {/* Panchang banner */}
            <View style={[styles.banner, { top: cy + rRest * 0.52 }]}>
              <Text style={styles.bannerText}>{panchangLine}</Text>
            </View>
          </View>
        </GestureDetector>

        {/* Aarti thali — the only draggable thing in the sanctum. */}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.thali, { left: cx - 52, top: cy - 52 }, thaliStyle]}>
            {/* Pulse ring hinting that the plate is the thing to grab. */}
            <Animated.View style={[styles.grabHint, grabHintStyle]} />
            <Thali size={104} />
          </Animated.View>
        </GestureDetector>

        <Toran width={stage.w} />
        <HangingBell side="left" ringing={autoRunning} onRing={playBell} />
        <HangingBell side="right" ringing={autoRunning} onRing={playBell} />

        {/* Ritual rail */}
        <View style={styles.rail}>
          <RailButton active label="" onPress={runAuto}>
            <Flame size={13} color="#FFB63D" />
          </RailButton>
          <RailButton onPress={toggleFlowers} active={flowersOn}>
            <Marigold size={26} />
          </RailButton>
          <RailButton onPress={resetAarti}>
            <View style={styles.shankh} />
          </RailButton>
          <RailButton label={t('collection')}>
            <View style={styles.calendar}>
              <View style={styles.calendarTop} />
            </View>
          </RailButton>
        </View>

        {/* Music */}
        <Pressable style={styles.musicWrap} onPress={toggleMusic}>
          <View style={[styles.musicBtn, musicOn && styles.musicBtnActive]}>
            <Text style={styles.musicGlyph}>{musicOn ? '❚❚' : '♪'}</Text>
          </View>
          <Text style={styles.musicLabel}>{musicOn ? t('stop') : t('listen')}</Text>
        </Pressable>

        {/* Aarti progress */}
        <View style={[styles.progressPill, { bottom: BottomTabInset + 16 }]}>
          <Text style={styles.progressText}>
            {done ? t('aarti_done') : `${circles} / ${AARTI_CIRCLES} ${t('parikrama')}`}
          </Text>
          <Text style={styles.mantraText}>{done ? deity.mantra : t('drag_hint')}</Text>
        </View>
      </View>
    </View>
  );
}

function RailButton({
  children,
  label,
  active,
  onPress,
}: {
  children: React.ReactNode;
  label?: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.railItem}>
      <View style={[styles.railCircle, active && styles.railCircleActive]}>{children}</View>
      {!!label && <Text style={styles.railLabel}>{label}</Text>}
    </Pressable>
  );
}

const GOLD = '#E9A417';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#7A5520' },
  topArea: { backgroundColor: GOLD, zIndex: 10, paddingTop: TopTabInset },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 10,
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#C0392B', fontWeight: '700', fontSize: 15 },
  titlePill: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    paddingVertical: 7,
    marginHorizontal: 6,
  },
  titleText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 3,
    paddingVertical: 3,
  },
  coinCount: { fontWeight: '700', color: '#3A2A10', fontSize: 14 },
  coin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F5B01A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinGlyph: { fontSize: 13, color: '#7A4A00', fontWeight: '700' },

  sanctum: { flex: 1, overflow: 'hidden' },
  stageFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  idolWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },

  banner: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#FFE063',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 5,
    zIndex: 3,
  },
  bannerText: { color: '#6B3B00', fontWeight: '700', fontSize: 13 },

  thali: {
    position: 'absolute',
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  grabHint: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#FFE9A8',
  },

  rail: { position: 'absolute', left: 10, bottom: 90, gap: 12, zIndex: 7 },
  railItem: { alignItems: 'center', gap: 2 },
  railCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(60,35,10,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,220,150,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railCircleActive: { backgroundColor: 'rgba(255,196,61,0.35)', borderColor: '#FFD98A' },
  railLabel: { color: '#FFF0CC', fontSize: 10, fontWeight: '600' },
  shankh: {
    width: 24,
    height: 20,
    backgroundColor: '#FFF3DA',
    borderTopLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 4,
    transform: [{ rotate: '-20deg' }],
  },
  calendar: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#FFF3DA',
    overflow: 'hidden',
  },
  calendarTop: { height: 7, backgroundColor: '#C0392B' },

  musicWrap: {
    position: 'absolute',
    right: 12,
    bottom: 96,
    alignItems: 'center',
    gap: 3,
    zIndex: 7,
  },
  musicBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#C2185B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  musicBtnActive: { backgroundColor: '#8E1348', borderColor: '#FFD98A' },
  musicGlyph: { color: '#FFFFFF', fontSize: 20 },
  musicLabel: { color: '#FFF0CC', fontSize: 11, fontWeight: '600' },

  progressPill: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(30,16,4,0.55)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 7,
    zIndex: 7,
  },
  progressText: { color: '#FFD98A', fontWeight: '700', fontSize: 14 },
  mantraText: { color: 'rgba(255,240,204,0.75)', fontSize: 11 },
});
