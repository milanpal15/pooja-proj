import { Button, Field } from '../../../ui/index.js';

/** The sign-in card. Presentational: the container owns the state and the request. */
export function LoginForm({ username, password, busy, error, onUsername, onPassword, onSubmit }) {
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-mark">ॐ</div>
        <h1>Bhakti</h1>
        <p className="muted">Admin Portal</p>

        <Field
          label="Username"
          value={username}
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          onChange={onUsername}
        />

        <Field
          label="Password"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={onPassword}
        />

        {!!error && <p className="login-error" role="alert">{error}</p>}

        <Button type="submit" loading={busy} disabled={!username || !password}>
          {busy ? 'Checking…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
