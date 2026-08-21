import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef, useState } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Icon, Mandala, Screen, Type } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { DEITIES } from '@/constants/deities';
import { DEITY_IMAGES } from '@/constants/deity-images';
import { WALLPAPER_STYLES } from '@/constants/reminders';
import { useLanguage } from '@/context/language';
import { Ember, Fill, Kumkum, Radius, Saffron, Space, useTheme } from '@/theme';

/**
 * Wallpapers — composed in the app, not shipped as images.
 *
 * The sanctum gradient, the mandala and the deity cutouts are already in the
 * design system, so a wallpaper is those three plus a mantra, captured at
 * device resolution. That means no megabytes of bundled art, every deity gets
 * one for free, and a new deity added to the catalogue arrives with wallpapers
 * already made.
 *
 * ⚠️ Two separate limits, and the screen states both rather than implying
 * otherwise:
 *
 *  1. The app SAVES to your gallery; it cannot set the wallpaper directly.
 *     That needs Android's WallpaperManager. Saving and letting you set it
 *     from the gallery is what most wallpaper apps do anyway.
 *  2. In Expo Go, saving does not work at all — `expo-media-library` throws
 *     the moment it is imported, so both it and the capture library are
 *     loaded lazily. Without that, importing them took the whole app down,
 *     since expo-router loads routes eagerly. The preview still renders; only
 *     the save is unavailable, and only until this runs as a dev build.
 */

let capture: any = null;
let media: any = null;
let probed = false;

/** Load the two native pieces, tolerating a runtime that lacks them. */
async function loadCapture(): Promise<boolean> {
  if (probed) return !!(capture && media);
  probed = true;
  // Same reason as the reminders hook: in Expo Go these modules throw during
  // evaluation, past any try/catch. Do not reach for them at all.
  if (Constants.executionEnvironment === 'storeClient' && Platform.OS === 'android') return false;
  try {
    // NOT 'expo-media-library'. In SDK 57 the default export is the new
    // API — Query/Asset/Album plus permission helpers — and it has no
    // saveToLibraryAsync at all. Calling it threw a TypeError that the catch
    // below swallowed into a generic "could not save". Saving lives in the
    // legacy entry point.
    media = await import('expo-media-library/legacy');
    capture = await import('react-native-view-shot');
  } catch {
    media = null;
    capture = null;
  }
  return !!(capture && media);
}

/** Backdrops, drawn from the palette rather than invented per screen. */
const WASHES: Record<string, readonly [string, string, string]> = {
  sanctum: [Ember[500], Ember[700], Ember[900]],
  dawn: [Saffron[200], Saffron[500], Ember[700]],
  night: [Ember[900], Kumkum[800], '#05070D'],
};

const DEITY_IDS = Object.keys(DEITY_IMAGES);

export default function WallpaperScreen() {
  const { c } = useTheme();
  const { lang } = useLanguage();
  const hi = lang === 'hi';

  const shotRef = useRef<View>(null);
  const [deityId, setDeityId] = useState(DEITY_IDS[0] ?? 'shiva');
  const [style, setStyle] = useState('sanctum');
  const [saving, setSaving] = useState(false);


  const deity = DEITIES.find((d) => d.id === deityId);
  const art = DEITY_IMAGES[deityId];

  const save = useCallback(async () => {
    setSaving(true);
    try {
      if (!(await loadCapture())) {
        Alert.alert(
          hi ? 'Expo Go में सहेजना उपलब्ध नहीं' : 'Saving needs a development build',
          hi
            ? 'गैलरी में सहेजने के लिए development build चाहिए। पूर्वावलोकन यहाँ काम करता है।'
            : 'Expo Go cannot reach the media library. The preview works here; saving will work once the app runs as a development build.',
        );
        return;
      }
      const perm = await media.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          hi ? 'अनुमति चाहिए' : 'Permission needed',
          hi
            ? 'वॉलपेपर सहेजने के लिए गैलरी की अनुमति दें।'
            : 'Allow access to your photos so the wallpaper can be saved.',
        );
        return;
      }

      // `tmpfile` rather than base64: the image is a few megapixels and the
      // media library wants a path anyway.
      const uri = await capture.captureRef(shotRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await media.saveToLibraryAsync(uri);

      Alert.alert(
        hi ? 'सहेज लिया' : 'Saved',
        hi
          ? 'वॉलपेपर आपकी गैलरी में है। वहाँ से इसे वॉलपेपर के रूप में सेट करें।'
          : 'The wallpaper is in your gallery. Set it from there — the app cannot set it for you.',
      );
    } catch (e) {
      Alert.alert(
        hi ? 'सहेजा नहीं जा सका' : 'Could not save',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setSaving(false);
    }
  }, [hi]);

  return (
    <Screen tabBar={false}>
      <AppBar
        title={hi ? 'वॉलपेपर' : 'Wallpapers'}
        subtitle={(hi ? deity?.name : deity?.title)?.toUpperCase()}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {DEITY_IDS.map((id) => {
            const d = DEITIES.find((x) => x.id === id);
            return (
              <Chip
                key={id}
                label={hi ? (d?.name ?? id) : (d?.title ?? id)}
                selected={id === deityId}
                onPress={() => setDeityId(id)}
              />
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {WALLPAPER_STYLES.map((s) => (
            <Chip
              key={s.id}
              label={hi ? s.titleHi : s.title}
              selected={s.id === style}
              onPress={() => setStyle(s.id)}
            />
          ))}
        </ScrollView>

        {/* The captured view. Everything inside it lands in the saved image,
            so nothing app-chrome may appear here. */}
        <View style={styles.previewWrap}>
          <View ref={shotRef} collapsable={false} style={styles.canvas}>
            <LinearGradient
              colors={WASHES[style] ?? WASHES.sanctum}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[Fill, { pointerEvents: 'none' }]}
            />
            <Mandala size={420} opacity={0.13} petals={20} style={styles.canvasMandala} />

            {art && <Image source={art} resizeMode="contain" style={styles.canvasArt} />}

            <View style={styles.canvasText}>
              <Type v="headlineLg" color="#FFF6E6" center numberOfLines={1}>
                {deity?.name}
              </Type>
              <Type v="mantra" color="rgba(255,246,230,0.86)" center numberOfLines={2}>
                {deity?.mantra}
              </Type>
            </View>
          </View>
        </View>

        <Button
          label={hi ? 'गैलरी में सहेजें' : 'Save to gallery'}
          icon="share"
          size="lg"
          block
          loading={saving}
          onPress={save}
        />

        <Card variant="sunken" style={{ borderLeftWidth: 3, borderLeftColor: c.gold }}>
          <View style={styles.note}>
            <Icon name="star" size={16} color={c.goldInk} />
            <View style={{ flex: 1, gap: 3 }}>
              <Type v="titleSm" tone="goldInk">
                {hi ? 'सेट कैसे करें' : 'How to set it'}
              </Type>
              <Type v="bodySm" tone="onSurfaceVariant">
                {hi
                  ? 'ऐप वॉलपेपर सहेजता है, सीधे लगा नहीं सकता। गैलरी खोलें, चित्र चुनें और "वॉलपेपर के रूप में सेट करें" चुनें।'
                  : 'The app saves the image but cannot apply it directly. Open your gallery, pick the image, and choose “Set as wallpaper”.'}
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
  chips: { gap: Space.sm, paddingVertical: 2, paddingRight: Space.sm },

  previewWrap: { alignItems: 'center' },
  canvas: {
    width: 260,
    // Roughly a modern phone's aspect, so the preview is honest about crop.
    height: 260 * (19.5 / 9),
    borderRadius: Radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  canvasMandala: { position: 'absolute', top: '14%', alignSelf: 'center' },
  canvasArt: { position: 'absolute', top: '26%', width: 210, height: 260 },
  canvasText: { paddingHorizontal: Space.md, paddingBottom: 56, gap: 6 },

  note: { flexDirection: 'row', gap: Space.sm },
});
