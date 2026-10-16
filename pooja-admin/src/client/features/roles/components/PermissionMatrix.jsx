import { useEffect, useRef } from 'react';

import { columnState, groupAreas, levelOf, setColumn, toggle } from '../lib/matrix.js';

/** A checkbox that can show "some" (indeterminate). */
function Tri({ state, label, disabled, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return <input ref={ref} type="checkbox" className="mx__check" aria-label={label} checked={state === 'all'} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;
}

/**
 * Rows = areas grouped like the sidebar, columns View and Edit. Edit forces View on; View off forces Edit off. A group
 * header ticks a whole column of its group. `canGrant(area, column)` is false for something the signed-in operator does
 * not hold themselves (the server would refuse it as an escalation), so those boxes are locked with a reason.
 */
export function PermissionMatrix({ areas, perms, onChange, readOnly, canGrant, areaKeys }) {
  const groups = groupAreas(areas);
  const lock = (a, col) => readOnly || !canGrant(a.key, col);
  return (
    <div className="ui-table-scroll">
      <table className="mx" aria-label="Permissions by area">
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col" className="mx__col">View</th>
            <th scope="col" className="mx__col">Edit</th>
          </tr>
        </thead>
        {groups.map((g) => {
          const keys = g.areas.map((a) => a.key);
          const skip = (k, col) => lock({ key: k }, col);
          return (
            <tbody key={g.label}>
              <tr className="mx__group">
                <th scope="rowgroup">{g.label}</th>
                <td className="mx__col"><Tri state={columnState(perms, keys, 'view')} label={`Select all View in ${g.label}`} disabled={readOnly} onChange={(on) => onChange(setColumn(perms, keys, 'view', on, areaKeys, skip))} /></td>
                <td className="mx__col"><Tri state={columnState(perms, keys, 'edit')} label={`Select all Edit in ${g.label}`} disabled={readOnly} onChange={(on) => onChange(setColumn(perms, keys, 'edit', on, areaKeys, skip))} /></td>
              </tr>
              {g.areas.map((a) => {
                const level = levelOf(perms, a.key);
                return (
                  <tr key={a.key} className="mx__row">
                    <th scope="row">
                      <span className="mx__name">{a.label}</span>
                      <span className="mx__desc">{a.description}</span>
                      {!readOnly && (lock(a, 'view') || lock(a, 'edit')) && <span className="mx__why">You do not hold this permission yourself, so you cannot grant it.</span>}
                    </th>
                    <td className="mx__col"><input type="checkbox" className="mx__check" aria-label={`${a.label}: View`} checked={level !== 'none'} disabled={lock(a, 'view')} onChange={(e) => onChange(toggle(perms, a.key, 'view', e.target.checked, areaKeys))} /></td>
                    <td className="mx__col"><input type="checkbox" className="mx__check" aria-label={`${a.label}: Edit`} checked={level === 'edit'} disabled={lock(a, 'edit')} onChange={(e) => onChange(toggle(perms, a.key, 'edit', e.target.checked, areaKeys))} /></td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
