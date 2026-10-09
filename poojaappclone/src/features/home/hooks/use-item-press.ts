import { useCallback } from 'react';

import type { RemoteHomeItem } from '@/providers/content';

import { useOpenHref } from './use-open-href';

/** Tap handler for a dashboard-authored item: follows its `href`, ignores items without one. */
export function useItemPress() {
  const open = useOpenHref();
  return useCallback((item: RemoteHomeItem) => void open(item.href), [open]);
}
