/**
 * Font loading.
 *
 * Nine faces: three display weights (Be Vietnam Pro), four body weights
 * (Plus Jakarta Sans), and four Devanagari weights (Noto Sans Devanagari) —
 * the last of which is what keeps Hindi strings in the design system rather
 * than falling back to Roboto or San Francisco. See typography.ts.
 */

import {
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  BeVietnamPro_800ExtraBold,
} from '@expo-google-fonts/be-vietnam-pro';
import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
} from '@expo-google-fonts/noto-sans-devanagari';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';

export const SacredFonts = {
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  BeVietnamPro_800ExtraBold,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
};

/**
 * Returns true once every face is registered.
 *
 * Deliberately non-blocking at the call site: the root layout keeps the
 * native splash up while this resolves, and `<Type>` renders with the
 * platform default if a face is somehow missing, so a font CDN problem
 * degrades to plain text rather than an empty screen.
 */
export function useSacredFonts(): boolean {
  const [loaded, error] = useFonts(SacredFonts);
  if (error) {
    console.warn('[fonts] failed to load, falling back to system faces:', error.message);
    return true;
  }
  return loaded;
}
