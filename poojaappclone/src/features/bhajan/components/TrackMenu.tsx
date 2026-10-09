import { Sheet, ListRow } from '@/components/ui';
import { useLanguage } from '@/i18n';

import type { Track } from '../types';

/** The ⋮ menu: save/remove favourite, play. */
export function TrackMenu({
  track,
  favourite,
  onClose,
  onToggleFavourite,
  onPlay,
}: {
  /** Set while open. */
  track: Track | null;
  favourite: boolean;
  onClose: () => void;
  onToggleFavourite: () => void;
  onPlay: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Sheet visible={track != null} onClose={onClose} title={track?.title}>
      <ListRow icon="play" title={t('bp_listen')} onPress={() => { onPlay(); onClose(); }} />
      <ListRow
        icon="heart"
        title={favourite ? t('bp_fav_remove') : t('bp_fav_add')}
        onPress={() => { onToggleFavourite(); onClose(); }}
        last
      />
    </Sheet>
  );
}
