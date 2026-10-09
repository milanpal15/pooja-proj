import { useRouter } from 'expo-router';
import { Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { LiveDetail } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Space } from '@/theme';

import { time12 } from '../lib/live-logic';
import { LivePlayer } from './LivePlayer';
import { LiveBadge, Thumb, ViewersPill } from './LiveBits';

const HEIGHT = 260;

/**
 * The top of the player screen. A live stream plays here (YouTube via the WebView component,
 * HLS/mp4 via expo-video) under an overlay of back / LIVE / viewers / share; anything else shows the
 * cover or a toned gradient with the next aarti time instead of a player. The overlay sits in a
 * `box-none` row so the player underneath keeps its own controls.
 */
export function PlayerHero({ stream }: { stream: LiveDetail }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, lang } = useLanguage();
  const name = pick(lang, stream.templeName, stream.templeNameHi);
  const playing = stream.state === 'live' && !!stream.url;
  const next = stream.nextAarti;
  const height = HEIGHT + insets.top;

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      {playing ? (
        <View style={[styles.fill, { paddingTop: insets.top }]}>
          <LivePlayer url={stream.url!} height={HEIGHT} label={t('live_darshan')} />
        </View>
      ) : (
        <Thumb slug={stream.slug} cover={stream.cover} radius={0} dim style={styles.fill}>
          <View style={[styles.center, { paddingTop: insets.top }]}>
            <Type v="titleLg" color="#FFFFFF" center>
              {stream.state === 'live' ? t('ld_unverified') : t('ld_offline')}
            </Type>
            {!!next && (
              <Type v="bodyMd" color="rgba(255,255,255,0.9)" center>
                {`${t('ld_next_at')} ${time12(next.time)} · ${pick(lang, next.name, next.nameHi)}`}
              </Type>
            )}
          </View>
        </Thumb>
      )}

      <View style={[styles.top, { paddingTop: insets.top + Space.sm }]} pointerEvents="box-none">
        <IconButton name="back" label={t('ld_back')} size={40} variant="glass" color="#FFFFFF" onPress={() => router.back()} />
        {stream.state === 'live' && <LiveBadge />}
        {playing && <ViewersPill viewers={stream.viewers} />}
        <View style={styles.spacer} pointerEvents="none" />
        <IconButton
          name="share"
          label={t('ld_share')}
          size={40}
          variant="glass"
          color="#FFFFFF"
          onPress={() => Share.share({ message: `${t('ld_share_msg')} ${name}` }).catch(() => {})}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: Space.lg },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Space.sm + 4,
  },
  spacer: { flex: 1 },
});
