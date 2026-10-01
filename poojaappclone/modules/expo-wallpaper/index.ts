import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/** Where the image should land. `both` is the default on Android. */
export type WallpaperTarget = 'home' | 'lock' | 'both';

/**
 * Sets the device wallpaper directly, instead of saving to the gallery and
 * asking the devotee to finish the job in another app.
 *
 * Android only — iOS has no public API for this at all, by Apple's choice.
 * Callers check `isAvailable()` first rather than relying on a thrown error.
 */
type NativeModule = {
  supportsLockScreen: boolean;
  setWallpaper: (uri: string, target: WallpaperTarget) => Promise<boolean>;
};

/*
 * Loaded through requireOptionalNativeModule so a runtime without the native
 * side — Expo Go, or iOS — gets null instead of a crash at import time. The
 * wallpaper screen already learned this lesson with expo-media-library:
 * expo-router loads routes eagerly, so a module that throws while being
 * imported takes the whole app down, not just the screen.
 */
let native: NativeModule | null = null;
try {
  if (Platform.OS === 'android') {
    native = requireOptionalNativeModule<NativeModule>('ExpoWallpaper');
  }
} catch {
  native = null;
}

/** True when this build can actually set the wallpaper. */
export function isAvailable(): boolean {
  return native !== null;
}

/**
 * True when home and lock can be set separately (Android 7+). Below that the
 * device has a single wallpaper, so offering the choice would be dishonest.
 */
export function supportsLockScreen(): boolean {
  return !!native?.supportsLockScreen;
}

/**
 * Point this at a `file://` image already written to disk.
 *
 * Resolves true on success and throws the native `CodedException` otherwise,
 * so the caller can tell "no permission" from "that file is not an image".
 */
export async function setWallpaper(uri: string, target: WallpaperTarget = 'both') {
  if (!native) throw new Error('Setting the wallpaper is not supported in this build.');
  return native.setWallpaper(uri, target);
}
