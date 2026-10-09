import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Microphone permission for a voice call. Android uses the core
 * `PermissionsAndroid`; iOS is prompted by the voice SDK itself on first use
 * (there is no iOS build of this app yet).
 */
export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const p = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(p)) return true;
  return (await PermissionsAndroid.request(p)) === PermissionsAndroid.RESULTS.GRANTED;
}
