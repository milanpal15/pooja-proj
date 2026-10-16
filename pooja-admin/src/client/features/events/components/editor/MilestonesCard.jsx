import { useState } from 'react';

import { Banner, Button, Card, Field, ReadoutField, Segmented } from '../../../../ui/index.js';
import { MAX_MILESTONES, MISSED, ORDERS, RULES, blankMilestone } from '../../lib/events.js';
import { useEd } from './EditorContext.js';
import { MilestoneItem } from './MilestoneItem.jsx';

/**
 * The rule builder: order, what a missed milestone does, how the event as a
 * whole is completed, and the milestones with their tasks. The task kinds come
 * from the server's registry; milestones are never marked done from here.
 */
export function MilestonesCard() {
  const { d, setBlock, lookups, ro, dis, err } = useEd();
  const ms = d.milestones;
  const [openKey, setOpenKey] = useState(null);
  const put = (items) => setBlock('milestones', { items });
  const patch = (i, m) => put(ms.items.map((x, j) => (j === i ? m : x)));
  const move = (i, dir) => {
    const next = ms.items.slice();
    next.splice(i + dir, 0, next.splice(i, 1)[0]);
    put(next);
  };
  const add = () => {
    const m = blankMilestone(ms.items.map((x) => x.key));
    put([...ms.items, m]);
    setOpenKey(m.key);
  };
  return (
    <Card title={`Milestones · ${ms.items.length}`} actions={!ro && <Button variant="outline" size="sm" disabled={ms.items.length >= MAX_MILESTONES} onClick={add}>+ Add milestone</Button>}>
      <div className="hs-form">
        {lookups.kindsStatus === 'error' && (
          <Banner tone="warning" action={<Button variant="outline" size="sm" onClick={lookups.reloadKinds}>Try again</Button>}>
            The list of task types could not be loaded, so tasks cannot be edited yet. {lookups.kindsError}
          </Banner>
        )}
        <div className="hs-pair">
          <div className="ui-field">
            <span className="ui-field__label">Order</span>
            {ro ? <ReadoutField label="" >{ORDERS.find((o) => o.value === ms.order)?.label}</ReadoutField> : <Segmented label="Milestone order" options={ORDERS} value={ms.order} onChange={(v) => setBlock('milestones', { order: v })} />}
          </div>
          <Field label="If a milestone is missed" type="select" value={ms.missed} options={MISSED} onChange={(v) => setBlock('milestones', { missed: v })} {...dis} />
        </div>
        <div className="hs-pair">
          <Field label="The event is finished when" type="select" value={ms.completion.rule} options={RULES.map((r) => ({ value: r.value, label: r.value === 'atLeast' ? 'At least N milestones are done' : r.value === 'any' ? 'Any one milestone is done' : 'All milestones are done' }))}
            onChange={(v) => setBlock('milestones', { completion: { ...ms.completion, rule: v } })} {...dis} />
          {ms.completion.rule === 'atLeast' && <Field label="How many (N)" type="number" min="1" value={ms.completion.n} error={err('milestones.completion.n')} onChange={(v) => setBlock('milestones', { completion: { ...ms.completion, n: v } })} {...dis} />}
        </div>
        {err('milestones.items') && <p className="ui-field__error">{err('milestones.items')}</p>}
        {ms.items.length === 0 && <p className="ui-field__hint">No milestones. Add the steps a devotee completes.</p>}
        <ul className="ev-mslist" aria-label="Milestones">
          {ms.items.map((m, i) => (
            <MilestoneItem key={m.key} m={m} index={i} count={ms.items.length} open={openKey === m.key} onToggle={() => setOpenKey(openKey === m.key ? null : m.key)}
              onChange={(nm) => patch(i, nm)} onMove={(dir) => move(i, dir)} onRemove={() => put(ms.items.filter((_, j) => j !== i))} />
          ))}
        </ul>
        <p className="ui-field__hint">Editing a live event never undoes milestones a devotee has already completed. Milestones are completed by devotees’ own progress, not from here.</p>
      </div>
    </Card>
  );
}
