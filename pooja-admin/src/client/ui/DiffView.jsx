import { useState } from 'react';

import { buildDiff, changedOnly, showValue } from '../lib/diff.js';

/**
 * before -> after as a table: field, before (struck through), after. Only changed fields unless "Show unchanged".
 * `labels` maps a dotted path to a readable name; `format(path, value)` may render a value (dates, version names).
 *
 * @typedef {Object} DiffViewProps
 * @property {object} [before]
 * @property {object} [after]
 * @property {Record<string,string>} [labels]
 * @property {(path: string, value: any) => string|undefined} [format]
 * @property {string} [label]
 */
export function DiffView({ before, after, labels = {}, format, label = 'Changes' }) {
  const [all, setAll] = useState(false);
  const rows = buildDiff(before, after);
  const changed = changedOnly(rows);
  const shown = all ? rows : changed;
  const name = (p) => labels[p] ?? p.replace(/\./g, ' › ');
  const val = (p, v) => {
    const f = format?.(p, v);
    return f !== undefined ? f : showValue(v);
  };
  return (
    <div className="ui-diff">
      {shown.length === 0 ? (
        <p className="ui-diff__none">{rows.length ? 'No differences.' : 'Nothing was recorded for this action.'}</p>
      ) : (
        <div className="ui-table-scroll">
          <table className="ui-diff__table" aria-label={label}>
            <thead>
              <tr>
                <th>Field</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.path} className={`ui-diff__row ui-diff__row--${r.kind}`}>
                  <th scope="row">{name(r.path)}</th>
                  <td>{r.kind === 'added' ? <span className="ui-diff__muted">—</span> : <del>{val(r.path, r.before)}</del>}</td>
                  <td>{r.kind === 'removed' ? <span className="ui-diff__muted">removed</span> : <ins>{val(r.path, r.after)}</ins>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > changed.length && (
        <button type="button" className="ui-diff__toggle" onClick={() => setAll((a) => !a)}>
          {all ? 'Hide unchanged fields' : `Show ${rows.length - changed.length} unchanged field${rows.length - changed.length === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}
