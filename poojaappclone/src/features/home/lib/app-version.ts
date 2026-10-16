import Constants from 'expo-constants';

/** The installed app's version (`expo.version`), compared with each block type's `minAppVersion`. */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';
