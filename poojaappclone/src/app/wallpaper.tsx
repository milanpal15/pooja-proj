import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef, useState } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Button, Card, Chip, Icon, Mandala, Screen, Type, useToast } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useContent } from '@/context/content';
import { useLanguage } from '@/context/language';
import * as Wallpaper from '../../modules/expo-wallpaper';
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
 * Setting the wallpaper is the primary action; saving to the gallery is the
 * fallback for anyone who wants the file. That needs Android's
 * WallpaperManager, which no maintained community package still wraps, so it
 * lives in the local `modules/expo-wallpaper` module.
 *
 * ⚠️ Both paths need native code, so in Expo Go neither works —
 * `expo-media-library` throws the moment it is imported, which is why it and
 * the capture library are loaded lazily. Without that, importing them took
 * the whole app down, since expo-router loads routes eagerly. The preview
 * still renders; only the actions are unavailable, and only until this runs
 * as a development build.
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

export default function WallpaperScreen() {
  const { c } = useTheme();
  const { lang } = useLanguage();
  const { deityArt, deityList, wallpaperStyles } = useContent();
  // Only deities the dashboard has artwork for can make a wallpaper.
  const deityIds = deityList.filter((d) => deityArt(d.id)).map((d) => d.id);
  const toast = useToast();
  const hi = lang === 'hi';

  const shotRef = useRef<View>(null);
  const [deityId, setDeityId] = useState(deityIds[0] ?? 'shiva');
  const [style, setStyle] = useState('sanctum');
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState<Wallpaper.WallpaperTarget | null>(null);


  // Resolved once: Expo Go and iOS have no native side at all.
  const canSet = Wallpaper.isAvailable();
  const splitTargets = canSet && Wallpaper.supportsLockScreen();

  const deity = deityList.find((d) => d.id === deityId);
  const art = deityArt(deityId);

  /** Render the preview to a PNG on disk and hand back its file:// uri. */
  const captureCanvas = useCallback(async (): Promise<string | null> => {
    if (!(await loadCapture())) {
      toast.info(hi ? 'Development build चाहिए' : 'Needs a development build', {
        description: hi
          ? 'Expo Go में यह सुविधा उपलब्ध नहीं है।'
          : 'Expo Go cannot reach the native image APIs.',
      });
      return null;
    }
    // `tmpfile` rather than base64: the image is a few megapixels and both
    // the media library and WallpaperManager want a path anyway.
    return capture.captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile' });
  }, [hi, toast]);

  /** Set the captured image as the device wallpaper. No gallery round-trip. */
  const apply = useCallback(
    async (target: Wallpaper.WallpaperTarget) => {
      setApplying(target);
      try {
        const uri = await captureCanvas();
        if (!uri) return;
        await Wallpaper.setWallpaper(uri, target);
        toast.success(hi ? 'वॉलपेपर सेट हो गया' : 'Wallpaper set', {
          description:
            target === 'lock'
              ? hi
                ? 'लॉक स्क्रीन पर लगा दिया गया।'
                : 'Applied to your lock screen.'
              : target === 'home'
                ? hi
                  ? 'होम स्क्रीन पर लगा दिया गया।'
                  : 'Applied to your home screen.'
                : hi
                  ? 'होम और लॉक दोनों पर लगा दिया गया।'
                  : 'Applied to both home and lock screens.',
        });
      } catch (e) {
        toast.error(hi ? 'सेट नहीं हो सका' : 'Could not set wallpaper', {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setApplying(null);
      }
    },
    [captureCanvas, hi, toast],
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const uri = await captureCanvas();
      if (!uri) return;

      const perm = await media.requestPermissionsAsync();
      if (!perm.granted) {
        toast.info(hi ? 'अनुमति चाहिए' : 'Permission needed', {
          description: hi
            ? 'वॉलपेपर सहेजने के लिए गैलरी की अनुमति दें।'
            : 'Allow access to your photos so the wallpaper can be saved.',
        });
        return;
      }
      await media.saveToLibraryAsync(uri);

      toast.success(hi ? 'सहेज लिया' : 'Saved', {
        description: hi ? 'वॉलपेपर आपकी गैलरी में है।' : 'The wallpaper is in your gallery.',
      });
    } catch (e) {
      toast.error(hi ? 'सहेजा नहीं जा सका' : 'Could not save', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  }, [captureCanvas, hi, toast]);

  return (
    <Screen tabBar={false}>
      <AppBar
        title={hi ? 'वॉलपेपर' : 'Wallpapers'}
        subtitle={(hi ? deity?.name : deity?.title)?.toUpperCase()}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {deityIds.map((id) => {
            const d = deityList.find((x) => x.id === id);
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
          {wallpaperStyles.map((s) => (
            <Chip
              key={s.slug}
              label={hi ? (s.titleHi ?? s.title) : s.title}
              selected={s.slug === style}
              onPress={() => setStyle(s.slug)}
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

        {/*
          Setting the wallpaper is the point of the screen, so it leads.
          Saving to the gallery stays for anyone who wants the file itself.
          Separate home/lock targets need Android 7+; below that the device
          has one wallpaper and offering the choice would be a lie.
        */}
        {canSet ? (
          splitTargets ? (
            <>
              <View style={styles.actionRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={hi ? 'होम स्क्रीन' : 'Home screen'}
                    icon="home"
                    size="lg"
                    block
                    loading={applying === 'home'}
                    disabled={!!applying || saving}
                    onPress={() => apply('home')}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={hi ? 'लॉक स्क्रीन' : 'Lock screen'}
                    variant="secondary"
                    icon="star"
                    size="lg"
                    block
                    loading={applying === 'lock'}
                    disabled={!!applying || saving}
                    onPress={() => apply('lock')}
                  />
                </View>
              </View>
              <Button
                label={hi ? 'दोनों पर लगाएँ' : 'Set on both'}
                variant="secondary"
                icon="check"
                size="lg"
                block
                loading={applying === 'both'}
                disabled={!!applying || saving}
                onPress={() => apply('both')}
              />
            </>
          ) : (
            <Button
              label={hi ? 'वॉलपेपर सेट करें' : 'Set as wallpaper'}
              icon="check"
              size="lg"
              block
              loading={!!applying}
              disabled={saving}
              onPress={() => apply('both')}
            />
          )
        ) : null}

        <Button
          label={hi ? 'गैलरी में सहेजें' : 'Save to gallery'}
          variant={canSet ? 'ghost' : 'primary'}
          icon="share"
          size="lg"
          block
          loading={saving}
          disabled={!!applying}
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
  actionRow: { flexDirection: 'row', gap: Space.sm },
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
