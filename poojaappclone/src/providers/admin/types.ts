import type { Analytics } from './analytics';
import type { FeatureKey, Flags } from './flags';

export type AdminContextValue = {
  flags: Flags;
  setFlag: (k: FeatureKey, v: boolean) => void;
  analytics: Analytics;
  trackScreen: (name: string) => void;
  resetAnalytics: () => void;
  isAdmin: boolean;
  unlockAdmin: () => void;
  lockAdmin: () => void;
};
