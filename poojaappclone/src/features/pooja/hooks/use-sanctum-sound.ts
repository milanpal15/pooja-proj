import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useContent } from '@/providers/content';

/**
 * The ghanta and the aarti ambience, both from the dashboard's tone list.
 *
 * These were two files compiled into the app, which meant the temple could
 * not change what its own sanctum sounds like without a store release.
 * Both players no-op safely while the tone has no audio uploaded yet —
 * `useAudioPlayer` keys on the source, so they pick it up once it arrives.
 *
 * `autoRunning` rings the bell through Auto Aarti; `reset` is what leaving
 * the tab calls to put the aarti back to the start.
 */
export function useSanctumSound(autoRunning: boolean, reset: () => void) {
  const { toneSound } = useContent();
  const [musicOn, setMusicOn] = useState(false);

  const bellSound = useAudioPlayer(toneSound('bell'));
  const aartiSound = useAudioPlayer(toneSound('aarti'));

  // Allow playback even when the phone is on silent (esp. iOS).
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

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
        reset();
      },
      [aartiSound, bellSound, reset],
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

  return { musicOn, toggleMusic, playBell };
}
