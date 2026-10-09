import { useCallback, useEffect, useRef, useState } from 'react';

import { api, setForbiddenHandler, setUnauthorizedHandler } from '../lib/api/index.js';
import { AccessProvider, FORBIDDEN_TEXT } from '../lib/access/index.js';
import { LoginPage } from '../features/login/index.js';
import { useToast } from '../ui/index.js';
import { AdminShell } from './AdminShell.jsx';

/**
 * The gate around the dashboard.
 *
 * Asks the server whether a password is configured and whether this browser
 * already holds a session. Three outcomes: still asking (blank), no session
 * (login), authed — or no password configured at all, which only happens in
 * local development because production refuses to start that way.
 *
 * The session also carries the account's role and permission list; it is
 * handed to <AccessProvider>, the single source of what the UI offers.
 */
export function App() {
  const [authed, setAuthed] = useState(null); // null = not yet known
  /** The session as the server described it: { required, username, role, permissions }. */
  const [session, setSession] = useState(null);
  const toast = useToast();
  const refetching = useRef(false);

  const check = useCallback(() => {
    return api
      .session()
      .then((s) => {
        const signedIn = !s.required || s.authed;
        setAuthed(signedIn);
        setSession(signedIn ? s : null);
      })
      .catch(() => setAuthed((a) => (a === null ? false : a)));
  }, []);

  useEffect(() => {
    check();
    // Any 401 from anywhere in the app drops straight back to the login
    // screen, so an expired session does not look like a broken dashboard.
    setUnauthorizedHandler(() => setAuthed(false));
    // A 403 means the screen offered something this account may not do (a
    // role changed under an open tab). Say so, and re-read the permissions.
    setForbiddenHandler(() => {
      toast.error(FORBIDDEN_TEXT);
      if (refetching.current) return;
      refetching.current = true;
      check().finally(() => {
        refetching.current = false;
      });
    });
    // The global handler has already reported it: no unhandled-rejection noise.
    const swallow = (e) => e.reason?.forbidden && e.preventDefault();
    window.addEventListener('unhandledrejection', swallow);
    return () => window.removeEventListener('unhandledrejection', swallow);
  }, [check, toast]);

  if (authed === null) return null;
  if (!authed) return <LoginPage onAuthed={check} />;
  const me = { username: session?.username ?? 'admin', role: session?.role ?? '' };
  return (
    <AccessProvider session={session}>
      <AdminShell
        me={me}
        onSignOut={() =>
          api.logout().finally(() => {
            setAuthed(false);
            setSession(null);
          })
        }
      />
    </AccessProvider>
  );
}
