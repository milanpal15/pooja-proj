import { useRef, useState } from 'react';

import { useAccess } from '../../lib/access/index.js';
import { Button, ReadOnlyBadge, Tabs } from '../../ui/index.js';
import { CategoriesTab } from './components/CategoriesTab.jsx';
import { ScheduleTab } from './components/ScheduleTab.jsx';
import { StreamsTab } from './components/StreamsTab.jsx';
import { useLookups } from './hooks/useLookups.js';

const TABS = [
  { id: 'streams', label: 'Streams' },
  { id: 'schedule', label: 'Aarti schedule' },
  { id: 'categories', label: 'Categories' },
];

/**
 * Live darshan (docs/LIVE_DARSHAN.md): the temple streams the app lists, their
 * aarti times and categories. `area` (content) decides whether this account
 * may write; without it every action is hidden and forms are read-only.
 */
export function LivePage({ area }) {
  const canEdit = useAccess().canEdit(area);
  const [tab, setTab] = useState('streams');
  const lookups = useLookups();
  const addRef = useRef(null);
  const addLabel = tab === 'categories' ? '+ Add category' : '+ Add stream';

  return (
    <div className="ui-page">
      <div className="hl-head">
        <p className="content-lede">Temple streams shown in the app. A stream shows as Live only while its source is actually broadcasting.</p>
        {canEdit ? tab !== 'schedule' && <Button onClick={() => addRef.current?.()}>{addLabel}</Button> : <ReadOnlyBadge />}
      </div>
      <Tabs label="Live darshan sections" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'streams' && <StreamsTab area={area} lookups={lookups} addRef={addRef} />}
      {tab === 'schedule' && <ScheduleTab lookups={lookups} />}
      {tab === 'categories' && <CategoriesTab area={area} lookups={lookups} addRef={addRef} />}
    </div>
  );
}
