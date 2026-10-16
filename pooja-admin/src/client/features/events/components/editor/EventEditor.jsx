import { useEffect } from 'react';

import { api } from '../../../../lib/api/index.js';
import { useLoader } from '../../../../lib/hooks/useLoader.js';
import { Badge, Banner, Button, ErrorState, ReadOnlyBadge, TableSkeleton, useConfirm } from '../../../../ui/index.js';
import { useEventEditor } from '../../hooks/useEventEditor.js';
import { statusChip } from '../../lib/events.js';
import { BlocksCard } from './BlocksCard.jsx';
import { ContentCard } from './ContentCard.jsx';
import { DetailsCard } from './DetailsCard.jsx';
import { EditorContext } from './EditorContext.js';
import { MilestonesCard } from './MilestonesCard.jsx';
import { ProgressCard } from './ProgressCard.jsx';
import { RewardsCard } from './RewardsCard.jsx';
import { WhenWhoCard } from './WhenWhoCard.jsx';

/**
 * The event editor: a full page that replaces the list. Left, the event and
 * its sections; right, the sections that need room (milestones, rewards,
 * content). The API's 400 `bad_event` `fields` appear inline at the same
 * paths the local checks use.
 */
export function EventEditor({ id, canEdit, lookups, onClose, onCreated }) {
  const confirm = useConfirm();
  const ed = useEventEditor({ id, lookups });
  const { draft: d, errors } = ed;
  const stats = useLoader(() => api.events.stats(id), { enabled: !!id });

  const back = async () => {
    if (ed.dirty && canEdit && !(await confirm({ title: 'Discard changes', message: 'This event has unsaved changes.', confirmLabel: 'Discard', tone: 'danger' }))) return;
    onClose();
  };
  const save = async () => {
    const wasNew = ed.isNew;
    const stored = await ed.save();
    if (stored && wasNew) onCreated(stored.id ?? stored._id ?? stored.slug);
  };
  useEffect(() => {
    const warn = (e) => { if (ed.dirty && canEdit) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [ed.dirty, canEdit]);

  if (ed.state.status === 'loading' || !d) return <div className="ui-page"><TableSkeleton rows={6} /></div>;
  if (ed.state.status === 'error') return <div className="ui-page"><Button variant="outline" onClick={onClose}>‹ Events</Button><ErrorState message={ed.state.error} offline={ed.state.offline} onRetry={() => window.location.reload()} /></div>;

  const has = (b) => d.blocks.includes(b);
  const st = ed.event ? statusChip(ed.event) : null;
  const errorList = Object.entries(errors);
  return (
    <EditorContext.Provider value={{ ...ed, d, ro: !canEdit, lookups, errors }}>
      <div className="ui-page ev-editor">
        <div className="ev-editor__head">
          <Button variant="ghost" onClick={back}>‹ Events</Button>
          <h2 className="ev-editor__title">{d.title || 'New event'}</h2>
          <span className="ev-editor__spacer" />
          {st && <Badge tone={st.tone}>{st.label}</Badge>}
          {canEdit ? <Button loading={ed.saving} disabled={!ed.dirty && !ed.isNew} onClick={save}>{ed.isNew ? 'Create event' : 'Save changes'}</Button> : <ReadOnlyBadge />}
        </div>
        {errorList.length > 0 && (
          <Banner tone="error">
            {errorList.length} {errorList.length === 1 ? 'field needs' : 'fields need'} attention.
            <ul className="ev-errors">
              {errorList.slice(0, 6).map(([k, v]) => <li key={k}>{k.replace(/\./g, ' › ')}: {v}</li>)}
              {errorList.length > 6 && <li>…and {errorList.length - 6} more</li>}
            </ul>
          </Banner>
        )}
        <div className="ev-editor__grid">
          <div className="ev-col">
            <DetailsCard />
            <BlocksCard />
            <WhenWhoCard />
            {!ed.isNew && has('milestones') && <ProgressCard milestones={d.milestones.items} stats={stats} />}
          </div>
          <div className="ev-col">
            {has('milestones') && <MilestonesCard />}
            {has('rewards') && <RewardsCard />}
            {has('content') && <ContentCard />}
            {!has('milestones') && !has('rewards') && !has('content') && (
              <p className="feat-note">Switch on Milestones, Rewards or Content under “Sections” to build them here.</p>
            )}
          </div>
        </div>
      </div>
    </EditorContext.Provider>
  );
}
