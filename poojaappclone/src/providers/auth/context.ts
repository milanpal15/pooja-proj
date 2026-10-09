import { createContext } from 'react';

import type { AuthContextValue } from './types';

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  needsProfile: false,
  pendingProfile: null,
  completeProfile: async () => {},
  refreshProfile: async () => {},
  signOut: async () => {},
  authError: null,
  clearAuthError: () => {},
  devoteeView: false,
  setDevoteeView: () => {},
});
