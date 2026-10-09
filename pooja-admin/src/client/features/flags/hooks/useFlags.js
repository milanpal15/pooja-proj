import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { usePoll } from '../../../lib/hooks/usePoll.js';
import { useToast } from '../../../ui/index.js';

/** The flag list (polled) plus a toggle that remembers which key is mid-write. */
export function useFlags() {
  const { data, err, reload } = usePoll(() => api.flags(), [], 8000);
  const [busy, setBusy] = useState('');
  const toast = useToast();

  const toggle = async (key, enabled) => {
    setBusy(key);
    try {
      await api.setFlag(key, enabled);
    } catch (e) {
      toast.error(`Could not change the flag. ${e.message}`);
    }
    try {
      await reload();
    } finally {
      setBusy('');
    }
  };

  return { data, err, busy, toggle };
}
