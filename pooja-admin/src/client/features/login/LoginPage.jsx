import { useState } from 'react';

import { api } from '../../lib/api/index.js';
import { LoginForm } from './components/LoginForm.jsx';

/**
 * The dashboard's front door.
 *
 * Per-operator username and password, checked server-side, exchanged for an
 * HttpOnly session cookie carrying the operator's role.
 *
 * The devotee accounts in the Users tab are a different thing entirely —
 * they belong to the app and sign in with Firebase. An operator is whoever
 * edits the temple's content.
 */
export function LoginPage({ onAuthed }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!username || !password || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.login(username, password);
      onAuthed();
    } catch (err) {
      // 401 is the ordinary case — a wrong password, not a broken server.
      // Deliberately does not say which half was wrong: naming the
      // username would let anyone enumerate who has access.
      setError(err.name === 'Unauthorized' ? 'Wrong username or password.' : err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LoginForm
      username={username}
      password={password}
      busy={busy}
      error={error}
      onUsername={setUsername}
      onPassword={setPassword}
      onSubmit={submit}
    />
  );
}
