import type { ViewStyle } from 'react-native';

import { MapBoundary } from '@/components/map/MapBoundary';
import { useLanguage } from '@/i18n';

import { fill } from '../../lib/events-logic';
import { stopKey } from '../../lib/route';
import { RouteMap } from './RouteMap';
import type { RouteSessionValue } from './RouteSession';

/** The session's map. Only ONE of these is mounted at a time (`session.host` decides, see EventHero / RouteFullScreen). */
export function SessionMap({ s, style, pillStyle }: { s: RouteSessionValue; style?: ViewStyle; pillStyle?: ViewStyle }) {
  const { t, lang } = useLanguage();
  return (
    <MapBoundary onError={s.failMap}>
      <RouteMap
        route={s.route}
        stops={s.stops}
        selectedKey={s.selected ? stopKey(s.selected) : null}
        focus={s.focus}
        user={s.user}
        lang={lang}
        labels={s.labels}
        wholeLabel={t('ev_route_whole')}
        a11y={fill(t('ev_route_a11y'), { stops: s.stops.length })}
        onSelect={s.select}
        onFailed={s.failMap}
        style={style}
        pillStyle={pillStyle}
      />
    </MapBoundary>
  );
}
