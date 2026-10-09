import { ScrollView, StyleSheet } from 'react-native';

import { Screen } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { Space } from '@/theme';

import { ApplyActions } from './components/ApplyActions';
import { HowToCard } from './components/HowToCard';
import { WallpaperCanvas } from './components/WallpaperCanvas';
import { WallpaperChoosers } from './components/WallpaperChoosers';
import { useWallpaper } from './hooks/use-wallpaper';

/**
 * Wallpapers — composed in the app, not shipped as images.
 *
 * The sanctum gradient, the mandala and the deity cutouts are already in the
 * design system, so a wallpaper is those three plus a mantra, captured at
 * device resolution. That means no megabytes of bundled art, every deity gets
 * one for free, and a new deity added to the catalogue arrives with wallpapers
 * already made.
 *
 * Setting the wallpaper is the primary action; saving to the gallery is the
 * fallback for anyone who wants the file. That needs Android's
 * WallpaperManager, which no maintained community package still wraps, so it
 * lives in the local `modules/expo-wallpaper` module.
 *
 * Both paths need native code — see `lib/capture.ts` for why the capture and
 * media libraries are loaded lazily.
 */
export function WallpaperScreen() {
  const w = useWallpaper();
  const { hi } = w;

  return (
    <Screen tabBar={false}>
      <AppBar
        title={hi ? 'वॉलपेपर' : 'Wallpapers'}
        subtitle={(hi ? w.deity?.name : w.deity?.title)?.toUpperCase()}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <WallpaperChoosers
          hi={hi}
          deityList={w.deityList}
          deityIds={w.deityIds}
          deityId={w.deityId}
          onDeity={w.setDeityId}
          styles={w.wallpaperStyles}
          style={w.style}
          onStyle={w.setStyle}
        />

        <WallpaperCanvas shotRef={w.shotRef} style={w.style} art={w.art} deity={w.deity} />

        <ApplyActions
          hi={hi}
          canSet={w.canSet}
          splitTargets={w.splitTargets}
          applying={w.applying}
          saving={w.saving}
          onApply={w.apply}
          onSave={w.save}
        />

        <HowToCard hi={hi} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.md },
});
