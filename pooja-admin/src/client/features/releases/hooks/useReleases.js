import { useCallback } from 'react';

import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';

/** The releases page data: releases + saved policy + pending requests, and the usage-by-version answer (best effort). */
export function useReleases() {
  const main = useLoader(() => api.releases.get());
  const usage = useLoader(() => api.versionUsage());
  const reload = useCallback(async () => {
    await Promise.all([main.reload(), usage.reload()]);
  }, [main.reload, usage.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = main.data || {};
  return {
    status: main.status,
    error: main.error,
    offline: main.offline,
    releases: d.releases || [],
    policy: d.policy || null,
    approvalsEnabled: d.approvalsEnabled !== false,
    pending: (d.pending || []).filter((p) => !p.status || p.status === 'pending'),
    usage: usage.data,
    reload,
  };
}
