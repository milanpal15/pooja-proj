import Constants from 'expo-constants';
import { Platform } from 'react-native';

/*
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
export async function loadCapture(): Promise<boolean> {
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

/** Render a view to a PNG on disk and hand back its file:// uri. Call `loadCapture()` first. */
export function captureView(ref: unknown): Promise<string> {
  // `tmpfile` rather than base64: the image is a few megapixels and both
  // the media library and WallpaperManager want a path anyway.
  return capture.captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
}

/** The legacy media-library module, once `loadCapture()` has succeeded. */
export function mediaLibrary(): any {
  return media;
}
