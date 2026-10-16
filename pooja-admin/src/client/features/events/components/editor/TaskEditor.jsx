import { Field, IconButton } from '../../../../ui/index.js';
import { configDefaults } from '../../lib/schema.js';
import { ConfigFields } from './ConfigFields.jsx';
import { useEd } from './EditorContext.js';

/** One task of a milestone: what completes it (the registry's kinds), its title, and that kind's settings. */
export function TaskEditor({ task, index, path, onChange, onRemove, canMove, onMove }) {
  const { lookups, ro, dis, err } = useEd();
  const kind = lookups.kindOf(task.kind);
  const unknown = task.kind && !kind && lookups.kinds.length > 0;
  const pickKind = (k) => onChange({ ...task, kind: k, config: lookups.kindOf(k) ? configDefaults(lookups.kindOf(k).configSchema) : {} });
  return (
    <li className="ev-task">
      <div className="ev-task__head">
        <b>Task {index + 1}</b>
        {!ro && (
          <span className="ev-task__tools">
            <IconButton label={`Move task ${index + 1} up`} disabled={!canMove.up} onClick={() => onMove(-1)}>↑</IconButton>
            <IconButton label={`Move task ${index + 1} down`} disabled={!canMove.down} onClick={() => onMove(1)}>↓</IconButton>
            <IconButton label={`Remove task ${index + 1}`} onClick={onRemove}>×</IconButton>
          </span>
        )}
      </div>
      <div className="hs-pair">
        <Field label="Completed when" type="select" value={task.kind} error={err(`${path}.kind`)} onChange={pickKind} {...dis}>
          <option value="">Choose…</option>
          {lookups.kinds.map((k) => <option key={k.kind} value={k.kind}>{k.title || k.kind}</option>)}
          {task.kind && !kind && <option value={task.kind}>{task.kind}{unknown ? ' (unavailable)' : ''}</option>}
        </Field>
        <Field label="Task title" hint="Optional. Shown to the devotee." value={task.title} error={err(`${path}.title`)} onChange={(v) => onChange({ ...task, title: v })} {...dis} />
      </div>
      <Field label="Task title (Hindi)" value={task.titleHi} onChange={(v) => onChange({ ...task, titleHi: v })} {...dis} />
      {kind && <ConfigFields schema={kind.configSchema} config={task.config} onChange={(config) => onChange({ ...task, config })} path={`${path}.config`} />}
      {kind?.description && <p className="ui-field__hint">{kind.description}</p>}
      {err(`${path}`) && <p className="ui-field__error">{err(`${path}`)}</p>}
    </li>
  );
}
