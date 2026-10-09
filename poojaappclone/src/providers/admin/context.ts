import { createContext } from 'react';

import { EMPTY_ANALYTICS } from './analytics';
import { DEFAULT_FLAGS } from './flags';
import type { AdminContextValue } from './types';

export const AdminContext = createContext<AdminContextValue>({
  flags: DEFAULT_FLAGS,
  setFlag: () => {},
  analytics: EMPTY_ANALYTICS,
  trackScreen: () => {},
  resetAnalytics: () => {},
  isAdmin: false,
  unlockAdmin: () => {},
  lockAdmin: () => {},
});
