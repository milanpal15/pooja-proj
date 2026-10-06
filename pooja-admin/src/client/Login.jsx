import { useState } from 'react';

import { api } from './api.js';

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
export function Login({ onAuthed }) {
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
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark">ॐ</div>
        <h1>Divine Temple</h1>
        <p className="muted">Admin Portal</p>

        <input
          value={username}
          autoFocus
          placeholder="Username"
          autoComplete="username"
          autoCapitalize="none"
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          type="password"
          value={password}
          placeholder="Password"
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />

        {!!error && <p className="login-error">{error}</p>}

        <button className="btn" type="submit" disabled={busy || !username || !password}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
