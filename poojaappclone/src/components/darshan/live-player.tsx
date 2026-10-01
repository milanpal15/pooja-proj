import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Type } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Plays a temple's live darshan feed.
 *
 * Two kinds of link arrive from the dashboard and they cannot be played the
 * same way:
 *
 *  - **YouTube.** A watch page is not a video stream, so no native player can
 *    open it, and YouTube's terms require playback through their embed rather
 *    than a scraped media URL. These run in a WebView on the iframe player.
 *  - **Anything else** — HLS `.m3u8` from a temple's own encoder, or a plain
 *    mp4 — is a real stream, so `expo-video` plays it natively. That is the
 *    smoother path; prefer it when a temple can provide one.
 */

export type LivePlayerProps = {
  url: string;
  height: number;
  /** Shown while the feed is still coming up. */
  label?: string;
};

/** Pull the video id out of the YouTube URL shapes people actually paste. */
export function youTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

export function LivePlayer({ url, height, label }: LivePlayerProps) {
  const ytId = useMemo(() => youTubeId(url), [url]);
  if (ytId) return <YouTubeFeed id={ytId} height={height} label={label} />;
  return <NativeFeed url={url} height={height} />;
}

/* ───────────────────────────────────────────────────────────── youtube ── */

function YouTubeFeed({ id, height, label }: { id: string; height: number; label?: string }) {
  const { c } = useTheme();
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<number | null>(null);

  /*
   * Built on YouTube's IFrame Player API rather than a plain `<iframe src>`,
   * for two reasons:
   *
   *  1. A bare `source={{ uri }}` WebView sends no Referer, and YouTube
   *     refuses embedded playback without an origin — it renders "Video
   *     player configuration error / Error 153". The document below is
   *     loaded with `baseUrl` on youtube.com, which supplies one.
   *  2. Channels can switch embedding off. When they have, the embed shows
   *     YouTube's own "This video is unavailable" (error 101/150) and the
   *     devotee is stuck. `onError` posts back so the screen can offer to
   *     open the YouTube app instead of dead-ending.
   */
  const html = useMemo(
    () => `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <style>
      html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}
      #p{width:100%;height:100%}
    </style>
  </head>
  <body>
    <div id="p"></div>
    <script src="https://www.youtube.com/iframe_api"></script>
    <script>
      function post(m){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(m); }
      function onYouTubeIframeAPIReady() {
        new YT.Player('p', {
          videoId: '${id}',
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1, mute: 1 },
          events: {
            onReady: function (e) { post('ready'); e.target.playVideo(); },
            // 101 and 150 both mean "the owner disallows embedding".
            onError: function (e) { post('error:' + e.data); }
          }
        });
      }
    </script>
  </body>
</html>`,
    [id],
  );

  if (errorCode !== null) {
    /*
     * YouTube's player error codes mean quite different things, and telling
     * a devotee "embedding is off" when the stream has simply ended would be
     * wrong. Only 101 and 150 are the embedding case.
     *   2   — malformed video id
     *   5   — HTML5 player failure
     *   100 — video removed, private, or the stream has ended
     *   101 / 150 — the channel disallows embedding
     */
    const embedBlocked = errorCode === 101 || errorCode === 150;
    const reason = embedBlocked
      ? 'The channel has embedding turned off.'
      : errorCode === 100
        ? 'The stream has ended or is no longer public.'
        : `The player could not start (error ${errorCode}).`;

    return (
      <View style={[styles.fill, styles.blocked, { height, backgroundColor: '#000' }]}>
        <Type v="titleSm" color="#FFFFFF" center>
          {embedBlocked
            ? 'This stream cannot play inside the app'
            : 'This stream is unavailable'}
        </Type>
        <Type v="bodySm" color="rgba(255,255,255,0.7)" center>
          {reason}
        </Type>
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${id}`).catch(() => {})}
          style={[styles.openBtn, { backgroundColor: c.primary }]}>
          <Type v="labelMd" color={c.onPrimary}>
            Watch on YouTube
          </Type>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { height, backgroundColor: '#000' }]}>
      <WebView
        source={{ html, baseUrl: 'https://www.youtube.com' }}
        style={styles.web}
        originWhitelist={['*']}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        onMessage={(e) => {
          const msg = e.nativeEvent.data;
          if (msg === 'ready') setLoading(false);
          if (msg.startsWith('error:')) {
            setLoading(false);
            setErrorCode(Number(msg.slice(6)) || 0);
          }
        }}
        onLoadEnd={() => setLoading(false)}
      />
      {loading && (
        <View style={[styles.overlay, { backgroundColor: c.scrim }]} pointerEvents="none">
          <ActivityIndicator color={c.gold} />
          {!!label && (
            <Type v="labelSm" color="#FFFFFF">
              {label}
            </Type>
          )}
        </View>
      )}
    </View>
  );
}

/* ────────────────────────────────────────────────────────────── native ── */

function NativeFeed({ url, height }: { url: string; height: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });

  /*
   * Pause when the screen loses focus — a live feed left running behind
   * another screen burns the devotee's data for nothing.
   *
   * Tied to focus, not unmount. `useVideoPlayer` releases the player itself
   * when the component goes away, and an unmount cleanup that called
   * `pause()` afterwards threw `ERR_USING_RELEASED_SHARED_OBJECT` and took
   * the whole Darshan screen down. The try/catch covers the ordering case
   * where blur and unmount arrive together.
   */
  useFocusEffect(
    useCallback(() => {
      try {
        player.play();
      } catch {
        // Player already gone; nothing to start.
      }
      return () => {
        try {
          player.pause();
        } catch {
          // Released before blur ran — expo-video has already stopped it.
        }
      };
    }, [player]),
  );

  return (
    <VideoView
      style={[styles.fill, { height, backgroundColor: '#000' }]}
      player={player}
      fullscreenOptions={{ enable: true }}
      allowsPictureInPicture={false}
      contentFit="contain"
      nativeControls
    />
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%' },
  web: { flex: 1, backgroundColor: '#000' },
  blocked: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  openBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, marginTop: 4 },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
