import { useState } from 'react';

import { api } from './api.js';

/**
 * The dashboard's front door.
 *
 * One shared password, checked server-side, exchanged for an HttpOnly
 * session cookie. Deliberately not a user system: there is one operator
 * here, and the devotee accounts in the Users tab are a different thing
 * entirely — they belong to the app, not to this.
 */
export function Login({ onAuthed }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      onAuthed();
    } catch (err) {
      // 401 is the ordinary case — a wrong password, not a broken server.
      setError(err.name === 'Unauthorized' ? 'That password is not right.' : err.message);
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
          type="password"
          value={password}
          autoFocus
          placeholder="Admin password"
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />

        {!!error && <p className="login-error">{error}</p>}

        <button className="btn" type="submit" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
