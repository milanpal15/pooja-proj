import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';

import { LocationRationale } from './LocationRationale';
import { AutoCheckInRow, ProgressCard, SessionStopCard } from './route/RouteBits';
import { useRouteSession } from './route/RouteSession';
import { StopList } from './route/StopList';
import { stopKey } from '../lib/route';

/**
 * The `route` block (docs/EVENTS.md §11.4): progress line, the card of the selected/next stop, the
 * auto check-in switch — all driven by the shared `RouteSession` (see route/RouteSession.tsx, which owns
 * the one location watcher). The map is NOT here: it lives in the event banner (and its full-screen
 * view). When the native map is unavailable this block shows the ordered stop list instead.
 */
export function RouteBlock() {
  const s = useRouteSession();
  const { t } = useLanguage();
  if (!s) return null;

  return (
    <View style={styles.wrap}>
      <Type v="titleMd">{t('ev_route')}</Type>
      <ProgressCard s={s} />

      {s.mode === 'cover' && (
        <>
          <Type v="bodySm" tone="onSurfaceVariant">
            {t('ev_route_no_map')}
          </Type>
          <StopList stops={s.stops} selectedKey={s.selected ? stopKey(s.selected) : null} user={s.user} onSelect={s.select} />
        </>
      )}

      <SessionStopCard s={s} />
      <AutoCheckInRow s={s} />

      {!s.fullscreen && <LocationRationale perm={s.perm} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
});
