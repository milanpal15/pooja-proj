import { useState } from 'react';

import { useLanguage } from '@/i18n';

import { LiveMapBoundary } from './components/LiveMapBoundary';
import { IllustratedMapScreen } from './IllustratedMapScreen';
import { LiveTemplesMap } from './LiveTemplesMap';
import { maplibre } from './lib/maplibre';

/**
 * `/temples-map`. The real map when this build contains the native MapLibre module; otherwise (older
 * dev client, Expo Go, or a render failure) today's illustrated map with a one-line note. Never throws.
 */
export function TemplesMapScreen() {
  const { t } = useLanguage();
  const [failed, setFailed] = useState(false);

  if (!maplibre || failed) return <IllustratedMapScreen note={t('map_needs_update')} />;
  return (
    <LiveMapBoundary onError={() => setFailed(true)}>
      <LiveTemplesMap />
    </LiveMapBoundary>
  );
}
