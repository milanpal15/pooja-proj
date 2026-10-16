import { useRef, useState } from 'react';

import { useAccess } from '../../lib/access/index.js';
import { Button, ReadOnlyBadge, Tabs } from '../../ui/index.js';
import { BadgesModal } from './components/BadgesModal.jsx';
import { EventEditor } from './components/editor/EventEditor.jsx';
import { EventsTab } from './components/EventsTab.jsx';
import { ParticipantsTab } from './components/ParticipantsTab.jsx';
import { TypesTab } from './components/TypesTab.jsx';
import { useLookups } from './hooks/useLookups.js';

const TABS = [
  { id: 'events', label: 'Events' },
  { id: 'types', label: 'Event types' },
  { id: 'participants', label: 'Participants' },
];

/**
 * Events (docs/EVENTS.md §7): the list of events, the preset types they start
 * from, who took part, and the badges they award. `area` (events) decides
 * whether this account may write; without it every action is hidden and the
 * forms are read-only. Opening an event swaps the whole page for the editor.
 */
export function EventsPage({ area }) {
  const canEdit = useAccess().canEdit(area);
  const [tab, setTab] = useState('events');
  const [editing, setEditing] = useState(null); // null | 'new' | an event id
  const [badges, setBadges] = useState(false);
  const lookups = useLookups();
  const addTypeRef = useRef(null);

  if (editing) {
    return <EventEditor id={editing === 'new' ? null : editing} canEdit={canEdit} lookups={lookups} onClose={() => setEditing(null)} onCreated={(id) => setEditing(id)} />;
  }
  return (
    <div className="ui-page">
      <div className="hl-head">
        <p className="content-lede">Create and update events and their milestones. Milestones are completed by each devotee’s own progress, not from here.</p>
        {canEdit ? (
          <div className="ev-actions">
            <Button variant="outline" onClick={() => setBadges(true)}>Badges</Button>
            {tab === 'types' ? <Button onClick={() => addTypeRef.current?.()}>+ New type</Button> : <Button onClick={() => setEditing('new')}>+ New event</Button>}
          </div>
        ) : (
          <div className="ev-actions">
            <Button variant="outline" onClick={() => setBadges(true)}>Badges</Button>
            <ReadOnlyBadge />
          </div>
        )}
      </div>
      <Tabs label="Events sections" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'events' && <EventsTab canEdit={canEdit} lookups={lookups} onOpen={setEditing} />}
      {tab === 'types' && <TypesTab canEdit={canEdit} lookups={lookups} addRef={addTypeRef} />}
      {tab === 'participants' && <ParticipantsTab />}
      {badges && <BadgesModal canEdit={canEdit} lookups={lookups} onClose={() => setBadges(false)} />}
    </div>
  );
}
