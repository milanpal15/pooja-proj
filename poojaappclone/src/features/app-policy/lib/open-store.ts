import { Linking } from 'react-native';

/** Open the store link; never throws (a bad link just does nothing). */
export function openStore(url: string): void {
  Linking.openURL(url).catch(() => {});
}
