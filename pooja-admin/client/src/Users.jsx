import { useCallback, useEffect, useState } from 'react';

import { api } from './api.js';

export function Users() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.users.list());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleBlock = async (u) => {
    await api.users.update(u._id, { blocked: !u.blocked });
    load();
  };
  const del = async (u) => {
    if (!confirm(`Delete ${u.name || u.contact}?`)) return;
    await api.users.remove(u._id);
    load();
  };

  if (err) return <div className="error">Can't reach API. {err}</div>;

  return (
    <div className="panel">
      <div className="cm-head">
        <span className="muted">{rows.length} users</span>
      </div>
      {rows.length === 0 ? (
        <p className="muted">No users yet — sign in on the app to create one.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Method</th>
              <th>Last Active</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u._id}>
                <td>{u.name || '—'}</td>
                <td>{u.contact}</td>
                <td className="muted">{u.method}</td>
                <td className="muted">{new Date(u.lastActive).toLocaleString()}</td>
                <td>
                  <span className={`pill ${u.blocked ? 'failed' : 'success'}`}>
                    {u.blocked ? 'blocked' : 'active'}
                  </span>
                </td>
                <td className="row-actions">
                  <button className="link-btn" onClick={() => toggleBlock(u)}>
                    {u.blocked ? 'Unblock' : 'Block'}
                  </button>
                  <button className="link-btn danger" onClick={() => del(u)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
