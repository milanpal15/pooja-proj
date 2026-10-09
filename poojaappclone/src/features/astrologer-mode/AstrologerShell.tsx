import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

import { type Incoming, useIncomingCall } from './hooks/use-incoming-call';
import { usePresence } from './hooks/use-presence';

type ShellValue = ReturnType<typeof usePresence> & {
  incoming: Incoming | null;
  resolveIncoming: (id: string) => void;
};

const ShellContext = createContext<ShellValue | null>(null);

/**
 * Wraps the whole signed-in tree while the astrologer shell is active, so the
 * Online switch, heartbeat and incoming-call polling survive moving between
 * tabs and into the call screen.
 */
export function AstrologerShell({ children }: { children: React.ReactNode }) {
  const presence = usePresence();
  const { incoming, resolve } = useIncomingCall(presence.online && !presence.busy);

  // Leaving astrologer mode (sign-out, "switch to devotee view") must not
  // leave the astrologer listed as online.
  const off = useRef(presence.goOffline);
  useEffect(() => {
    off.current = presence.goOffline;
  }, [presence.goOffline]);
  useEffect(() => () => void off.current(), []);

  const value = useMemo(
    () => ({ ...presence, incoming, resolveIncoming: resolve }),
    [presence, incoming, resolve],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useAstrologerShell(): ShellValue {
  const v = useContext(ShellContext);
  if (!v) throw new Error('useAstrologerShell must be used inside <AstrologerShell>');
  return v;
}
