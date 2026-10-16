import { Button, Card, Field, IconButton } from '../../../../ui/index.js';
import { REWARD_KINDS, blankReward, milestoneOptions } from '../../lib/events.js';
import { useEd } from './EditorContext.js';

/** Rewards: coins, a badge or a certificate, given when a milestone or the whole event is completed. */
export function RewardsCard() {
  const { d, set, lookups, ro, dis, err } = useEd();
  const rewards = d.rewards;
  const patch = (i, p) => set({ rewards: rewards.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const ms = d.blocks.includes('milestones') ? milestoneOptions(d) : [];
  const triggers = [{ value: 'event', label: 'Finishing the event' }, ...(ms.length ? [{ value: 'milestone', label: 'Completing a milestone' }] : [])];
  return (
    <Card title="Rewards" description="Given by the server when the devotee’s own progress completes the milestone or event.">
      <div className="lv-aartis">
        {rewards.length === 0 && <p className="ui-field__hint">No rewards.</p>}
        <ul className="lv-aartis__list" aria-label="Rewards">
          {rewards.map((r, i) => (
            <li key={i} className="ev-fieldrow">
              <div className="hs-pair">
                <Field label="Reward" type="select" value={r.kind} options={REWARD_KINDS} onChange={(v) => patch(i, { kind: v })} {...dis} />
                {r.kind === 'coins' && <Field label="Coins" type="number" min="1" value={r.coins} error={err(`rewards.${i}.coins`)} onChange={(v) => patch(i, { coins: v })} {...dis} />}
                {r.kind === 'badge' && (
                  <Field label="Badge" type="select" value={r.badgeSlug} error={err(`rewards.${i}.badgeSlug`)} onChange={(v) => patch(i, { badgeSlug: v })} {...dis}>
                    <option value="">Choose a badge…</option>
                    {lookups.options.badges.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    {r.badgeSlug && !lookups.options.badges.some((b) => b.value === r.badgeSlug) && <option value={r.badgeSlug}>{r.badgeSlug}</option>}
                  </Field>
                )}
                {r.kind === 'certificate' && <p className="ui-field__hint">A shareable certificate when the event is finished.</p>}
              </div>
              <div className="hs-pair">
                <Field label="Given on" type="select" value={r.on} options={triggers} onChange={(v) => patch(i, { on: v })} {...dis} />
                {r.on === 'milestone' && (
                  <Field label="Milestone" type="select" value={r.milestoneKey} error={err(`rewards.${i}.milestoneKey`)} onChange={(v) => patch(i, { milestoneKey: v })} {...dis}>
                    <option value="">Choose…</option>
                    {ms.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </Field>
                )}
              </div>
              {!ro && <IconButton label={`Remove reward ${i + 1}`} onClick={() => set({ rewards: rewards.filter((_, j) => j !== i) })}>×</IconButton>}
            </li>
          ))}
        </ul>
        {!ro && <Button variant="outline" size="sm" onClick={() => set({ rewards: [...rewards, blankReward()] })}>+ Add reward</Button>}
      </div>
    </Card>
  );
}
