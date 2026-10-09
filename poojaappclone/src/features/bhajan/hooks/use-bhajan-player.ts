import { useAudioPlayer } from 'expo-audio';
import { useCallback, useMemo, useState } from 'react';

import { useToast } from '@/components/ui';
import { assetUrl, useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';

import type { Track } from '../types';

/**
 * The dashboard's aartis as a shelf of tracks, and one player pointed at whichever is tapped.
 * Filtering lives in `use-shelf`; this hook is only the audio engine.
 */
export function useBhajanPlayer() {
  const { t } = useLanguage();
  const { aartis } = useContent();
  const toast = useToast();
  /*
   * One empty player, pointed at whichever track is tapped.
   *
   * It used to be created with a single bundled aarti loop, so every row on
   * the shelf played the same recording no matter which one was tapped —
   * the titles came from the dashboard, the audio did not. Each aarti
   * carries its own `audioUrl` now.
   */
  const player = useAudioPlayer(null);
  const [nowPlaying, setNowPlaying] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);

  const tracks: Track[] = useMemo(
    () =>
      aartis.map((a) => ({
        id: a._id,
        title: a.title,
        artist: a.artist ?? '',
        len: a.duration ?? '',
        category: a.category ?? '',
        deity: a.deitySlug ?? '',
        url: assetUrl(a.audioUrl),
      })),
    [aartis],
  );

  const play = useCallback(
    (track: Track) => {
      setNowPlaying(track);
      if (!track.url) {
        // The shelf is the dashboard's list, and a row can exist before its
        // recording has been uploaded. Selecting it is still honest; silently
        // playing nothing would not be.
        setPlaying(false);
        toast.info(t('bhajan_no_audio'));
        return;
      }
      try {
        player.replace({ uri: track.url });
        player.loop = true;
        player.seekTo(0);
        player.play();
        setPlaying(true);
      } catch {
        // An unreachable recording shouldn't take the screen down; the row
        // still selects so the UI stays honest about what was tapped.
        setPlaying(false);
      }
    },
    [player, t, toast],
  );

  const toggle = useCallback(() => {
    if (!nowPlaying?.url) return;
    try {
      if (playing) player.pause();
      else player.play();
    } catch {
      /* see above */
    }
    setPlaying((p) => !p);
  }, [player, playing, nowPlaying]);

  return { tracks, nowPlaying, playing, play, toggle };
}
