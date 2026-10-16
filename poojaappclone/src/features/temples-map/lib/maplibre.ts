import { TurboModuleRegistry } from 'react-native';

import { loadOptionalModule } from './optional-module';

/**
 * `@maplibre/maplibre-react-native`, or null when this build does not contain its native half (an
 * older dev client, Expo Go). It is loaded lazily and only here: importing the package statically
 * would throw at startup in such a build and take the whole route down with it. Every screen that
 * wants the live map reads `maplibre` and falls back to the illustrated map when it is null.
 */
type MapLibre = typeof import('@maplibre/maplibre-react-native');

export const maplibre: MapLibre | null = loadOptionalModule<MapLibre>(
  () => TurboModuleRegistry.get('MLRNMapViewModule') != null,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require('@maplibre/maplibre-react-native'),
);
