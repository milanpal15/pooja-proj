import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  Card,
  Icon,
  Screen,
  SectionBand,
  Type,
  type IconName,
  useToast,
} from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/context/language';
import { useReminders } from '@/hooks/use-reminders';
import { Radius, Space, useTheme } from '@/theme';
import { type ToneId } from '@/constants/reminders';
import { type RemoteTone, useContent } from '@/context/content';

/**
 * Alert tone — the "Ringtone" tile.
 *
 * ⚠️ This sets what THIS APP plays for its reminders, not the phone's system
 * ringtone. Replacing the device ringtone needs Android's RingtoneManager and
 * the WRITE_SETTINGS permission, neither of which exists in Expo Go — it would
 * take a native module and a development build.
 *
 * That limit is stated on the screen rather than hidden, because a setting
 * that silently does less than its name implies is worse than one that
 * explains itself. Choosing the app's own alert sound is real, works today,
 * and is what most devotees actually want from this.
 */
export default function RingtoneScreen() {
  const { tones, toneSound } = useContent();
  const { c } = useTheme();
  const { lang } = useLanguage();
  const toast = useToast();
  const hi = lang === 'hi';
  const { state, setTone } = useReminders();

  const [playing, setPlaying] = useState<ToneId | null>(null);

  /*
   * One player, re-pointed at whichever tone was tapped.
   *
   * There used to be a player per bundled tone — two of them, named in the
   * code — so a tone added from the dashboard could not be previewed at all,
   * and picking several in a row layered their sounds over each other. No
   * audio ships in the bundle now; every tone is a URL, and one player that
   * gets `replace`d covers all of them however many the temple adds.
   */
  const player = useAudioPlayer(null);

  // Without this the preview is silent whenever the phone is on vibrate —
  // which, for an app people open in a temple, is most of the time. The pooja
  // screen already did this; the tone picker needs it more, since being
  // silent is indistinguishable from being broken here.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, [, toast]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Silence everything.
   *
   * Each tone has its own player, so playing a second one simply layered it
   * over the first — picking three tones quickly left three sounds running at
   * once, and choosing Silent stopped nothing at all. Every selection now
   * stops all players first, whether or not it has something to play.
   */
  const stopAll = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    try {
      player.pause();
      player.seekTo(0);
    } catch {
      /* nothing loaded */
    }
    setPlaying(null);
  }, [player]);

  // Leaving the screen should not leave a bell ringing behind it.
  //
  // This MUST NOT depend on `stopAll`. It did, and `stopAll` is rebuilt
  // whenever the player objects change identity — which happens on the very
  // re-render that `setPlaying` triggers. So the effect's cleanup fired
  // milliseconds after play() and paused the sound every time. The tone was
  // playing; it was being stopped again immediately.
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(
    () => () => {
      try {
        playerRef.current.pause();
      } catch {
        /* already gone */
      }
    },
    [],
  );

  const preview = useCallback(
    (tone: RemoteTone) => {
      stopAll();
      const source = toneSound(tone.slug);
      if (!source) {
        // Silent and Phone Default have nothing of their own to play, and
        // that is the point of them — say nothing. Any other tone with no
        // recording behind it is a row the dashboard has not finished, and
        // saying so beats a tap that looks like it did nothing.
        if (tone.slug !== 'default' && tone.slug !== 'silent') {
          toast.info(hi ? 'इस ध्वनि की फ़ाइल नहीं है' : 'No audio for this tone', {
            description: hi
              ? 'डैशबोर्ड से इसकी ध्वनि अपलोड करें।'
              : 'Upload one for it in the dashboard.',
          });
        }
        return;
      }
      try {
        // Remote, so it buffers rather than being ready the instant it is
        // asked for; play() queues until it is.
        player.replace(source);
        player.play();
        setPlaying(tone.slug);
        // No completion callback on the player, so clear the indicator on a
        // timer. It is a preview affordance, not playback state.
        timer.current = setTimeout(() => {
          setPlaying((p) => (p === tone.slug ? null : p));
          try {
            player.pause();
            player.seekTo(0);
          } catch {
            /* already gone */
          }
        }, 2500);
      } catch {
        // An unreachable file should not take the screen down.
      }
    },
    [player, toneSound, hi, stopAll, toast],
  );

  return (
    <Screen tabBar={false}>
      <AppBar
        title={hi ? 'अलर्ट ध्वनि' : 'Alert Tone'}
        subtitle={hi ? 'आरती अलार्म के लिए' : 'FOR AARTI REMINDERS'}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionBand title={hi ? 'ध्वनि चुनें' : 'Choose a tone'} tone="gold">
          {tones.map((tone, i) => {
            const on = state.tone === tone.slug;
            return (
              <View key={tone.slug}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setTone(tone.slug);
                    preview(tone);
                  }}
                  style={({ pressed }) => [styles.tone, pressed && { opacity: 0.8 }]}>
                  <View
                    style={[
                      styles.medallion,
                      { backgroundColor: on ? c.primaryContainer : c.containerLow },
                    ]}>
                    <Icon
                      name={playing === tone.slug ? 'pause' : ((tone.icon ?? 'bell') as IconName)}
                      size={20}
                      color={on ? c.primary : c.onSurfaceFaint}
                    />
                  </View>

                  <View style={{ flex: 1, gap: 1 }}>
                    <Type v="titleSm" numberOfLines={1}>
                      {hi ? tone.titleHi : tone.title}
                    </Type>
                    <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
                      {hi ? tone.descHi : tone.desc}
                    </Type>
                  </View>

                  {/* Selection is a radio and a colour change, never colour
                      alone. */}
                  <View style={[styles.radio, { borderColor: on ? c.primary : c.outline }]}>
                    {on && <View style={[styles.radioDot, { backgroundColor: c.primary }]} />}
                  </View>
                </Pressable>

                {i < tones.length - 1 && (
                  <View style={[styles.rule, { backgroundColor: c.outlineVariant }]} />
                )}
              </View>
            );
          })}
        </SectionBand>

        <Type v="bodySm" tone="onSurfaceVariant">
          {hi
            ? 'तुरंत सुनने के लिए किसी ध्वनि पर टैप करें।'
            : 'Tap a tone to hear it. The change applies to every reminder you have on.'}
        </Type>

        {/* Say plainly what this does not do. */}
        <Card variant="sunken" style={{ borderLeftWidth: 3, borderLeftColor: c.gold }}>
          <View style={styles.note}>
            <Icon name="settings" size={16} color={c.goldInk} />
            <View style={{ flex: 1, gap: 3 }}>
              <Type v="titleSm" tone="goldInk">
                {hi ? 'फ़ोन की रिंगटोन नहीं' : 'Not your phone’s ringtone'}
              </Type>
              <Type v="bodySm" tone="onSurfaceVariant">
                {hi
                  ? 'यह सेटिंग केवल इस ऐप की आरती सूचनाओं की ध्वनि बदलती है। फ़ोन की कॉल रिंगटोन बदलने के लिए Android की अनुमति चाहिए जो अभी उपलब्ध नहीं है।'
                  : 'This changes the sound this app plays for aarti reminders. Replacing the ringtone your phone uses for calls needs an Android permission the app cannot request yet.'}
              </Type>
            </View>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.md },
  tone: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: 11 },
  medallion: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rule: { height: StyleSheet.hairlineWidth * 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 11, height: 11, borderRadius: Radius.full },
  note: { flexDirection: 'row', gap: Space.sm },
});
