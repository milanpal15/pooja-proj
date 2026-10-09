import { StyleSheet, View } from 'react-native';

import { useAdmin } from '@/providers/admin';
import { useLanguage } from '@/i18n';
import { byDistanceFrom, formatDistance } from '@/lib/geo';
import { useSavedTemples } from '@/lib/saved-temples';
import { useContent } from '@/providers/content';

import { useGrantedLocation } from '../hooks/use-granted-location';
import { SectionHead } from './SectionHead';
import { TempleNear } from './TempleNear';

const SHOWN = 2;

/**
 * "Temples near you". Ranked by distance only when location was ALREADY
 * granted (Home never asks); otherwise the dashboard's own order, with no
 * distance printed. Omitted when the dashboard has no temples.
 */
export function TemplesNearYou({ here, onOpen }: { here: ReturnType<typeof useGrantedLocation>; onOpen: (path: string) => void }) {
  const { t, lang } = useLanguage();
  const { templeList, bookingEnabled } = useContent();
  const { flags } = useAdmin();
  const { isSaved, toggleSave } = useSavedTemples();
  if (!templeList.length) return null;

  const placed = templeList.filter((x) => x.coords.lat);
  const ranked = here
    ? byDistanceFrom(here, placed.map((x) => ({ ...x, coords: x.coords })))
    : templeList.map((x) => ({ ...x, km: undefined as number | undefined }));

  return (
    <View style={styles.wrap}>
      <SectionHead title={t('hv_temples_near')} link={t('hv_view_map')} onLink={() => onOpen('/temples-map')} />
      {ranked.slice(0, SHOWN).map((tpl) => (
        <TempleNear
          key={tpl.id}
          name={tpl.name}
          place={tpl.location}
          distance={tpl.km !== undefined ? formatDistance(tpl.km, lang === 'hi' ? 'hi' : 'en') : undefined}
          saved={isSaved(tpl.id)}
          saveLabel={t('hv_save_temple')}
          labels={{ book: t('hv_book'), offer: t('hv_offer'), navigate: t('navigate') }}
          onSave={() => toggleSave(tpl.id)}
          onBook={bookingEnabled(tpl.id) ? () => onOpen(`/poojas?temple=${encodeURIComponent(tpl.id)}`) : undefined}
          onOffer={flags.chadhava ? () => onOpen(`/chadhava?temple=${encodeURIComponent(tpl.id)}`) : undefined}
          onNavigate={() => onOpen('/temples-map')}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: 10 } });
