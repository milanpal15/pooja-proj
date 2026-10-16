import { Linking, Platform } from 'react-native';

import { type Destination, directionsUrls } from './directions';

/** Hands a destination to the phone's maps app (geo: / Apple Maps, then Google's web page). False when nothing opened. */
export async function openDirections(d: Destination): Promise<boolean> {
  for (const url of directionsUrls(d, Platform.OS)) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      /* try the next scheme */
    }
  }
  return false;
}
