import { useCallback, useEffect, useState } from 'react';

import { api } from './api.js';

/**
 * The people who sign in to this dashboard.
 *
 * Not the Users tab — that is devotees, who sign in to the app with
 * Firebase and have no access here at all. Keeping them in separate tabs
 * with separate words is deliberate: the one mistake worth designing
 * against is an operator thinking "delete user" means an operator account.
 *
 * Admin-only. An editor never sees this tab, and the server turns the
 * request away with 403 even if they reach the URL by hand.
 */
export function Operators({ me }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState('');
  const [adding, setAdding] = useState(null); // form object or null
  const [resetting, setResetting] = useState(null); // { id, username }

  const load = useCallback(async () => {
    try {
      setRows(await api.operators.list());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id, fn) => {
    setBusy(id);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const create = async () => {
    setErr(null);
    try {
      await api.operators.create(adding);
      setAdding(null);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const resetPassword = async () => {
    setErr(null);
    try {
      await api.operators.update(resetting.id, { password: resetting.password });
      setResetting(null);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="panel">
      <div className="cm-head">
        <span className="muted">{rows.length} operators</span>
        <button
          className="btn"
          onClick={() => setAdding({ username: '', password: '', role: 'editor' })}>
          + Add operator
        </button>
      </div>

      {!!err && <div className="error">{err}</div>}

      <p className="muted">
        <strong>Admin</strong> can do everything, including this page, devotee accounts, feature
        flags and payments. <strong>Editor</strong> can write content — deities, temples,
        horoscope, festivals, announcements — and nothing else.
      </p>

      <table className="table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Last signed in</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const isMe = me && o.username === me.username;
            return (
              <tr key={o._id}>
                <td>
                  {o.username}
                  {isMe && <span className="muted"> · you</span>}
                </td>
                <td>
                  <select
                    value={o.role}
                    disabled={busy === o._id || isMe}
                    onChange={(e) => act(o._id, () => api.operators.update(o._id, { role: e.target.value }))}>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="muted">
                  {o.lastLogin ? new Date(o.lastLogin).toLocaleString() : 'never'}
                </td>
                <td>
                  <button
                    className={o.active ? 'toggle on' : 'toggle'}
                    disabled={busy === o._id || isMe}
                    aria-pressed={!!o.active}
                    onClick={() => act(o._id, () => api.operators.update(o._id, { active: !o.active }))}>
                    <span className="dot" />
                    {o.active ? 'Active' : 'Suspended'}
                  </button>
                </td>
                <td className="row-actions">
                  <button
                    className="link-btn"
                    onClick={() => setResetting({ id: o._id, username: o.username, password: '' })}>
                    Set password
                  </button>
                  {/* Your own row has no destructive controls at all — the
                      server refuses anyway, but an enabled button that
                      always errors is worse than no button. */}
                  {!isMe && (
                    <button
                      className="link-btn danger"
                      disabled={busy === o._id}
                      onClick={() => {
                        if (!confirm(`Delete the operator "${o.username}"?`)) return;
                        act(o._id, () => api.operators.remove(o._id));
                      }}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {adding && (
        <div className="modal-backdrop" onClick={() => setAdding(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New operator</h3>
            <div className="form">
              <div className="field">
                <label>Username</label>
                <input
                  value={adding.username}
                  autoFocus
                  placeholder="3–32 characters, a–z 0–9 . _ -"
                  onChange={(e) => setAdding({ ...adding, username: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  value={adding.password}
                  placeholder="at least 8 characters"
                  onChange={(e) => setAdding({ ...adding, password: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Role</label>
                <select
                  value={adding.role}
                  onChange={(e) => setAdding({ ...adding, role: e.target.value })}>
                  <option value="editor">Editor — content only</option>
                  <option value="admin">Admin — everything</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setAdding(null)}>
                Cancel
              </button>
              <button className="btn" onClick={create}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {resetting && (
        <div className="modal-backdrop" onClick={() => setResetting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Set password for {resetting.username}</h3>
            <div className="form">
              <div className="field">
                <label>New password</label>
                <input
                  type="password"
                  autoFocus
                  value={resetting.password}
                  placeholder="at least 8 characters"
                  onChange={(e) => setResetting({ ...resetting, password: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setResetting(null)}>
                Cancel
              </button>
              <button className="btn" onClick={resetPassword}>
                Set password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
