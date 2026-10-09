import { useState } from 'react';

import { Button } from '../ui/index.js';
import { useAccess, visibleTabs } from '../lib/access/index.js';
import { useHashRoute } from '../lib/hooks/useHashRoute.js';
import { Sidebar } from './Sidebar.jsx';
import { TABS } from './tabs.js';

/** The signed-in dashboard: sidebar + the current tab's page, routed by #hash. */
export function AdminShell({ me, onSignOut }) {
  const [tab, setTab] = useHashRoute('Overview');
  // The Overview poll is the dashboard's connectivity probe.
  const [online, setOnline] = useState(true);

  const access = useAccess();
  const tabs = visibleTabs(TABS, access);
  // A stale #Users bookmark, or a link from before a role change, gets the
  // first tab this account can actually see.
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  if (!active) {
    return (
      <div className="app">
        <main className="content">
          <h1>No access</h1>
          <p className="muted">This account has no dashboard areas. Ask an administrator to change its role.</p>
          <Button variant="secondary" onClick={onSignOut}>Sign out</Button>
        </main>
      </div>
    );
  }
  const Page = active.Component;

  return (
    <div className="app">
      <Sidebar tabs={tabs} current={active.id} onSelect={setTab} online={online} me={me} onSignOut={onSignOut} />
      <main className="content">
        <h1>{active.id}</h1>
        <Page key={active.id} me={me} setOnline={setOnline} area={active.area} />
      </main>
    </div>
  );
}
