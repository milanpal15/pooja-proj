import { useCallback, useEffect, useState } from 'react';

import { api } from './api.js';

/**
 * Generic CRUD manager for a content resource.
 * `fields`: [{ key, label, type }] where type is
 * text | number | textarea | image | audio | csv | bool.
 */
/**
 * Normalise whatever is stored into one of the option values.
 *
 * Tolerates an array (the correct shape), a comma string (hand-edited or
 * legacy), or nothing at all, and falls back to the first option so the
 * select always has a matching value rather than rendering blank.
 */
function toEnumValue(stored, options) {
  const list = Array.isArray(stored)
    ? stored
    : String(stored ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
  const key = list.slice().sort().join(',');
  return options.some((o) => o.value === key) ? key : options[0].value;
}

export function ContentManager({ title, resource, fields, previewKey, rowAction }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null); // form object or null
  const [uploading, setUploading] = useState('');
  const [busyRow, setBusyRow] = useState('');

  // Columns are chosen, not the first four fields. `bookingEnabled` is the
  // 7th temple field, so it was never visible in the table — the one control
  // an operator most needs at a glance was reachable only through Edit.
  const columns = fields.some((f) => f.col) ? fields.filter((f) => f.col) : fields.slice(0, 4);

  const load = useCallback(async () => {
    try {
      setRows(await resource.list());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, [resource]);

  useEffect(() => {
    load();
  }, [load]);

  const blank = () =>
    Object.fromEntries(
      fields.map((f) => {
        switch (f.type) {
          case 'bool':
            return [f.key, true];
          case 'number':
            return [f.key, 0];
          case 'csv':
            return [f.key, []];
          case 'enumList':
            // Stored as an array; the option values are comma-joined strings.
            return [f.key, String(f.options?.[0]?.value ?? '').split(',').filter(Boolean)];
          case 'select':
            return [f.key, f.options?.[0]?.value ?? ''];
          default:
            return [f.key, ''];
        }
      }),
    );

  const save = async () => {
    const body = { ...editing };
    // normalise csv fields to arrays
    fields
      .filter((f) => f.type === 'csv')
      .forEach((f) => {
        body[f.key] = String(body[f.key] || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      });
    if (body._id) await resource.update(body._id, body);
    else await resource.create(body);
    setEditing(null);
    load();
  };

  /** Flip a boolean straight from the table, optimistically. */
  const toggleBool = async (row, key) => {
    const next = !row[key];
    setBusyRow(row._id);
    setRows((rs) => rs.map((r) => (r._id === row._id ? { ...r, [key]: next } : r)));
    try {
      await resource.update(row._id, { [key]: next });
    } catch (e) {
      setRows((rs) => rs.map((r) => (r._id === row._id ? { ...r, [key]: !next } : r)));
      setErr(e.message);
    } finally {
      setBusyRow('');
    }
  };

  const del = async (row) => {
    if (!confirm(`Delete "${row[previewKey] || row.name || row.title}"?`)) return;
    await resource.remove(row._id);
    load();
  };

  const onFile = async (field, file) => {
    if (!file) return;
    setUploading(field);
    try {
      const { url } = await api.upload(file);
      setEditing((e) => ({ ...e, [field]: url }));
    } finally {
      setUploading('');
    }
  };

  if (err) return <div className="error">Can't reach API. {err}</div>;

  return (
    <div className="panel">
      <div className="cm-head">
        <span className="muted">{rows.length} items</span>
        <button className="btn" onClick={() => setEditing(blank())}>
          + Add {title}
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th></th>
            {columns.map((f) => (
              <th key={f.key}>{f.label}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._id}>
              <td>
                {row.imageUrl ? (
                  <img className="thumb" src={api.asset(row.imageUrl)} alt="" />
                ) : (
                  <div className="thumb ph">{(row.name || row.title || '?')[0]}</div>
                )}
              </td>
              {columns.map((f) => (
                <td key={f.key} className={f.type === 'bool' ? '' : 'muted'}>
                  {f.type === 'bool' ? (
                    <button
                      className={row[f.key] ? 'toggle on' : 'toggle'}
                      disabled={busyRow === row._id}
                      aria-pressed={!!row[f.key]}
                      onClick={() => toggleBool(row, f.key)}>
                      <span className="dot" />
                      {row[f.key] ? 'On' : 'Off'}
                    </button>
                  ) : (
                    String(row[f.key] ?? '')
                  )}
                </td>
              ))}
              <td className="row-actions">
                {rowAction && (
                  <button
                    className="link-btn"
                    title={rowAction.title}
                    disabled={busyRow === row._id}
                    onClick={async () => {
                      setBusyRow(row._id);
                      try {
                        const r = await rowAction.run(row);
                        setErr(null);
                        alert(rowAction.done ? rowAction.done(r) : 'Done');
                        load();
                      } catch (e) {
                        setErr(e.message);
                      } finally {
                        setBusyRow('');
                      }
                    }}>
                    {rowAction.label}
                  </button>
                )}
                <button className="link-btn" onClick={() => setEditing({ ...row })}>
                  Edit
                </button>
                <button className="link-btn danger" onClick={() => del(row)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing._id ? `Edit ${title}` : `New ${title}`}</h3>
            <div className="form">
              {fields.map((f) => (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  {f.type === 'textarea' ? (
                    <textarea
                      value={editing[f.key] ?? ''}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                    />
                  ) : f.type === 'bool' ? (
                    <label className="switch-row">
                      <span className="switch">
                        <input
                          type="checkbox"
                          checked={!!editing[f.key]}
                          onChange={(e) => setEditing({ ...editing, [f.key]: e.target.checked })}
                        />
                        <span className="slider" />
                      </span>
                      <span className="switch-state">{editing[f.key] ? 'On' : 'Off'}</span>
                    </label>
                  ) : f.type === 'select' ? (
                    <select
                      value={String(editing[f.key] || f.options?.[0]?.value || '')}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'enumList' ? (
                    // A set of values stored as an array, chosen as one option.
                    // Announcements only ever want modal, push, or both — three
                    // named choices read better than two checkboxes the operator
                    // has to reason about.
                    <select
                      value={toEnumValue(editing[f.key], f.options)}
                      onChange={(e) =>
                        setEditing({ ...editing, [f.key]: e.target.value.split(',').filter(Boolean) })
                      }>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'image' || f.type === 'audio' ? (
                    <div className="upload-row">
                      <input
                        value={editing[f.key] ?? ''}
                        placeholder="paste URL or upload →"
                        onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                      />
                      <label className="btn small">
                        {uploading === f.key ? '…' : 'Upload'}
                        <input
                          type="file"
                          hidden
                          accept={f.type === 'image' ? 'image/*' : 'audio/*'}
                          onChange={(e) => onFile(f.key, e.target.files?.[0])}
                        />
                      </label>
                      {f.type === 'image' && editing[f.key] && (
                        <img className="thumb" src={api.asset(editing[f.key])} alt="" />
                      )}
                    </div>
                  ) : (
                    <input
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={
                        Array.isArray(editing[f.key]) ? editing[f.key].join(', ') : editing[f.key] ?? ''
                      }
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn" onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
