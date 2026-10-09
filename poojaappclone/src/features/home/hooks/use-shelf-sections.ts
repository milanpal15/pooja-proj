import { useMemo } from 'react';

import { useAdmin } from '@/providers/admin';
import { useContent } from '@/providers/content';

import { DEFAULT_SECTIONS } from '../constants/default-layout';
import { renderableSections, shelfSections } from '../lib/sections';
import { useNow } from './use-now';

/**
 * The dashboard's shelf sections (Pitru Paksha, Books, Knowledge, Ancestors),
 * re-checked each minute against their schedule. The dashboard's layout wins;
 * with none served (offline and nothing cached) the bundled seed stands in.
 */
export function useShelfSections() {
  const { home } = useContent();
  const { flags } = useAdmin();
  const now = useNow(60_000);

  return useMemo(
    () => shelfSections(renderableSections(home?.sections ?? DEFAULT_SECTIONS, flags, now)),
    [home, flags, now],
  );
}
