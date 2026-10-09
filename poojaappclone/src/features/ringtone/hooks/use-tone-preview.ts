import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/ui';
import { type RemoteTone, useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';
import type { ToneId } from '@/features/alarm';

/** Previewing a tone: one player, re-pointed at whichever tone was tapped. */
export function useTonePreview() {
  const { toneSound } = useContent();
  const { lang } = useLanguage();
  const toast = useToast();
  const hi = lang === 'hi';

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

  return { playing, preview };
}
