import { useCallback, useRef, useState } from 'react';
import type { View } from 'react-native';

import { useToast } from '@/components/ui';
import { useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';

import { captureView, loadCapture, mediaLibrary } from '../lib/capture';
import * as Wallpaper from '../lib/native-wallpaper';

/** Picking a deity and style, capturing the preview, and setting or saving it. */
export function useWallpaper() {
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
    return captureView(shotRef);
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

      const media = mediaLibrary();
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

  return {
    hi,
    deityList,
    deityIds,
    deityId,
    setDeityId,
    deity,
    art,
    wallpaperStyles,
    style,
    setStyle,
    shotRef,
    saving,
    applying,
    canSet,
    splitTargets,
    apply,
    save,
  };
}
