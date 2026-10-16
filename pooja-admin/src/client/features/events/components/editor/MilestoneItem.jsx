import { Badge, Button, Field, IconButton } from '../../../../ui/index.js';
import { MAX_TASKS, RULES, blankTask } from '../../lib/events.js';
import { countUnder } from '../../lib/schema.js';
import { useEd } from './EditorContext.js';
import { TaskEditor } from './TaskEditor.jsx';

/** A collapsible milestone: header (number, title, task kinds, errors), then its fields and tasks. */
export function MilestoneItem({ m, index, count, open, onToggle, onChange, onMove, onRemove }) {
  const { lookups, ro, dis, err, errors } = useEd();
  const path = `milestones.items.${index}`;
  const bad = countUnder(errors, path);
  const patchTask = (i, t) => onChange({ ...m, tasks: m.tasks.map((x, j) => (j === i ? t : x)) });
  const moveTask = (i, dir) => {
    const next = m.tasks.slice();
    next.splice(i + dir, 0, next.splice(i, 1)[0]);
    onChange({ ...m, tasks: next });
  };
  const ruleLabel = RULES.find((r) => r.value === m.completion.rule)?.label || '';
  return (
    <li className={`ev-ms ${open ? 'ev-ms--open' : ''}`}>
      <div className="ev-ms__head">
        <span className="ev-ms__num" aria-hidden="true">{index + 1}</span>
        <button type="button" className="ev-ms__title" aria-expanded={open} onClick={onToggle}>
          <b>{m.title || `Milestone ${index + 1}`}</b>
          <span className="ev-ms__chips">
            {m.tasks.map((t) => <span key={t.key} className="ev-tag">{lookups.kindOf(t.kind)?.title || t.kind || 'No task type'}</span>)}
          </span>
          {bad > 0 && <Badge tone="danger">{bad} to fix</Badge>}
          <span className="ev-ms__chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        {!ro && (
          <span className="ev-ms__tools">
            <IconButton label={`Move milestone ${index + 1} up`} disabled={index === 0} onClick={() => onMove(-1)}>↑</IconButton>
            <IconButton label={`Move milestone ${index + 1} down`} disabled={index === count - 1} onClick={() => onMove(1)}>↓</IconButton>
            <IconButton label={`Remove milestone ${index + 1}`} onClick={onRemove}>×</IconButton>
          </span>
        )}
      </div>
      {open && (
        <div className="ev-ms__body">
          <div className="hs-pair">
            <Field label="Title" value={m.title} error={err(`${path}.title`)} onChange={(v) => onChange({ ...m, title: v })} {...dis} />
            <Field label="Opens (IST)" type="datetime-local" value={m.opensAt} error={err(`${path}.opensAt`)} onChange={(v) => onChange({ ...m, opensAt: v })} {...dis} />
          </div>
          <div className="hs-pair">
            <Field label="Title (Hindi)" value={m.titleHi} onChange={(v) => onChange({ ...m, titleHi: v })} {...dis} />
            <Field label="Short note" value={m.summary} onChange={(v) => onChange({ ...m, summary: v })} {...dis} />
          </div>
          <h4 className="ev-sub">Tasks · {ruleLabel.toLowerCase()}</h4>
          {m.tasks.length === 0 && <p className="ui-field__hint">No tasks yet. A milestone with no task can never be completed.</p>}
          <ul className="ev-tasks" aria-label={`Tasks of milestone ${index + 1}`}>
            {m.tasks.map((t, i) => (
              <TaskEditor key={t.key} task={t} index={i} path={`${path}.tasks.${i}`} onChange={(nt) => patchTask(i, nt)}
                onRemove={() => onChange({ ...m, tasks: m.tasks.filter((_, j) => j !== i) })} canMove={{ up: i > 0, down: i < m.tasks.length - 1 }} onMove={(d) => moveTask(i, d)} />
            ))}
          </ul>
          {err(`${path}.tasks`) && <p className="ui-field__error">{err(`${path}.tasks`)}</p>}
          {!ro && <Button variant="outline" size="sm" disabled={m.tasks.length >= MAX_TASKS} onClick={() => onChange({ ...m, tasks: [...m.tasks, blankTask(m.tasks.map((t) => t.key))] })}>+ Add task</Button>}
          <div className="hs-pair">
            <Field label="Task rule" type="select" value={m.completion.rule} options={RULES} onChange={(v) => onChange({ ...m, completion: { ...m.completion, rule: v } })} {...dis} />
            {m.completion.rule === 'atLeast' && <Field label="How many (N)" type="number" min="1" value={m.completion.n} error={err(`${path}.completion.n`)} onChange={(v) => onChange({ ...m, completion: { ...m.completion, n: v } })} {...dis} />}
          </div>
          <div className="hs-pair">
            <Field label="Coins for this milestone" type="number" min="0" value={m.coins} error={err(`${path}.coins`)} onChange={(v) => onChange({ ...m, coins: v })} {...dis} />
            <span />
          </div>
          <div className="hs-pair">
            <Field label="Link label" hint="Optional shortcut shown with the milestone" value={m.linkLabel} error={err(`${path}.link.label`)} onChange={(v) => onChange({ ...m, linkLabel: v })} {...dis} />
            <Field label="Link goes to" placeholder="/darshan" value={m.linkRoute} error={err(`${path}.link.route`)} onChange={(v) => onChange({ ...m, linkRoute: v })} {...dis} />
          </div>
        </div>
      )}
    </li>
  );
}
