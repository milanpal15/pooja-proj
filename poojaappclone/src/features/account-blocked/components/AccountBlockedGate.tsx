import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useAccountBlocked } from '../hooks/use-account-blocked';
import { AccountBlockedScreen } from './AccountBlockedScreen';

/**
 * Mounted once at the root, next to PolicyGate. ALWAYS renders `children`; a block draws the full-screen
 * Modal over the top (route-free: nothing to navigate to, nothing to back out to).
 */
export function AccountBlockedGate({ children }: { children: ReactNode }) {
  const { state, tryAgain, signOut } = useAccountBlocked();
  return (
    <View style={{ flex: 1 }}>
      {children}
      {state.block && <AccountBlockedScreen state={state} onTryAgain={tryAgain} onSignOut={signOut} />}
    </View>
  );
}
