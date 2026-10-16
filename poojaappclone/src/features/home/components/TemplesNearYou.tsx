import { StyleSheet, View } from 'react-native';

import { useLanguage } from '@/i18n';
import { useSavedTemples } from '@/lib/saved-temples';
import { useAdmin } from '@/providers/admin';
import { useContent } from '@/providers/content';

import type { NearTemple } from '../hooks/use-sources';
import { SectionHead } from './SectionHead';
import { TempleNear } from './TempleNear';

/**
 * "Temples near you": the temples the `temples.near_me` source resolved —
 * ranked by distance only when location was ALREADY granted (Home never asks),
 * otherwise the dashboard's own order with no distance printed.
 */
export function TemplesNearYou({
  temples,
  title,
  link,
  onLink,
  onOpen,
}: {
  temples: NearTemple[];
  title: string;
  link: string;
  onLink: () => void;
  onOpen: (path: string) => void;
}) {
  const { t } = useLanguage();
  const { bookingEnabled } = useContent();
  const { flags } = useAdmin();
  const { isSaved, toggleSave } = useSavedTemples();

  return (
    <View style={styles.wrap}>
      <SectionHead title={title} link={link} onLink={onLink} />
      {temples.map((tpl) => (
        <TempleNear
          key={tpl.id}
          name={tpl.name}
          place={tpl.location}
          distance={tpl.distance}
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
