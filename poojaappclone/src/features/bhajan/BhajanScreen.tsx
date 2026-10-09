import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, IconButton, NoContent, Screen, Type, useScrollPadding } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Space, useTheme } from '@/theme';

import { DeityChips } from './components/DeityChips';
import { KindTiles } from './components/KindTiles';
import { MiniPlayer } from './components/MiniPlayer';
import { TodayBanner } from './components/TodayBanner';
import { TrackMenu } from './components/TrackMenu';
import { TrackRow } from './components/TrackRow';
import { useBhajanPlayer } from './hooks/use-bhajan-player';
import { useShelf } from './hooks/use-shelf';
import type { Track } from './types';

/**
 * Bhajan — the media library: deity chips, today's mantra, kind tiles and the
 * full list, with favourites and a mini-player.
 *
 * A sanctum screen (`Screen mode="sanctum"` paints the backdrop). The
 * Favourites view is the route param `?view=favourites`, so Profile can link
 * straight to it and the header heart toggles it without extra state.
 */
export function BhajanScreen() {
  return (
    <Screen mode="sanctum">
      <BhajanBody />
    </Screen>
  );
}

function BhajanBody() {
  const router = useRouter();
  const { c } = useTheme();
  const { t } = useLanguage();
  const scrollPad = useScrollPadding(96);
  const { view } = useLocalSearchParams<{ view?: string }>();
  const favouritesOnly = view === 'favourites';

  const b = useBhajanPlayer();
  const shelf = useShelf(b.tracks, favouritesOnly);
  const [menu, setMenu] = useState<Track | null>(null);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.scroll, scrollPad]} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Type v="display" style={{ flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '700' }}>
            {favouritesOnly ? t('bp_favourites') : t('media_library')}
          </Type>
          <IconButton
            name="heart"
            variant="glass"
            label={t('bp_fav_view')}
            color={favouritesOnly ? c.gold : c.onSurface}
            onPress={() => router.setParams({ view: favouritesOnly ? '' : 'favourites' })}
          />
        </View>

        {!favouritesOnly && <DeityChips deities={shelf.deities} value={shelf.deity} onChange={shelf.setDeity} />}
        {!favouritesOnly && shelf.today && <TodayBanner track={shelf.today} onListen={() => b.play(shelf.today!)} />}
        {!favouritesOnly && (
          <View style={styles.tiles}>
            <KindTiles kinds={shelf.kinds} value={shelf.kind} onPick={shelf.pickKind} />
          </View>
        )}

        <Type v="titleMd" style={{ fontSize: 17 }}>
          {favouritesOnly ? t('bp_favourites') : t('bp_all_music')}
        </Type>

        <View>
          {shelf.visible.length === 0 && (
            <NoContent
              title={favouritesOnly ? t('bp_fav_empty_title') : t('media_library')}
              body={favouritesOnly ? t('bp_fav_empty_body') : t('bhajan_empty')}
            />
          )}
          {shelf.visible.map((tr) => (
            <TrackRow
              key={tr.id}
              track={tr}
              active={b.nowPlaying?.id === tr.id}
              playing={b.playing}
              favourite={shelf.fav.isFavourite(tr.id)}
              onPlay={() => (b.nowPlaying?.id === tr.id ? b.toggle() : b.play(tr))}
              onMore={() => setMenu(tr)}
            />
          ))}
        </View>

        {(shelf.deity || shelf.kind) && !favouritesOnly && (
          <Button
            label={t('bp_clear_filter')}
            variant="outline"
            size="sm"
            onPress={() => {
              shelf.setDeity('');
              if (shelf.kind) shelf.pickKind(shelf.kind);
            }}
          />
        )}
      </ScrollView>

      {b.nowPlaying && <MiniPlayer track={b.nowPlaying} playing={b.playing} onToggle={b.toggle} />}

      <TrackMenu
        track={menu}
        favourite={menu ? shelf.fav.isFavourite(menu.id) : false}
        onClose={() => setMenu(null)}
        onToggleFavourite={() => menu && shelf.fav.toggle(menu.id)}
        onPlay={() => menu && b.play(menu)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Space.md, paddingTop: Space.sm, gap: Space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
