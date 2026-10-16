import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, useConfirm } from '../ui/index.js';
import { useAccess, visibleTabs } from '../lib/access/index.js';
import { useRoute } from '../lib/hooks/useRoute.js';
import { childFor } from '../lib/nav/registry.js';
import { Breadcrumbs } from './Breadcrumbs.jsx';
import { CommandPalette } from './CommandPalette.jsx';
import { NotFound } from './NotFound.jsx';
import { Sidebar } from './Sidebar.jsx';
import { TopBar } from './TopBar.jsx';
import { GROUPS, TABS } from './tabs.js';

/**
 * The signed-in dashboard: grouped sidebar + top bar + breadcrumbs + the current module's page, routed by the nested
 * hash router (`#/group/module/<id>`; old `#Tab` links are rewritten). The registry (tab-areas.js) feeds the sidebar,
 * the breadcrumbs and the ⌘K palette; the session's permission list decides what each shows.
 */
export function AdminShell({ me, onSignOut }) {
  const confirm = useConfirm();
  const access = useAccess();
  const [online, setOnline] = useState(true); // the Overview poll is the connectivity probe
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const modules = useMemo(() => visibleTabs(TABS, access), [access]);
  const { route, navigate, replace } = useRoute(TABS, GROUPS, confirm);
  const first = modules[0];
  const go = useCallback((target) => navigate(target), [navigate]);

  // ⌘K / Ctrl-K opens the palette from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const active = route.kind === 'module' ? modules.find((m) => m.id === route.module.id) : null;
  // Close the drawer when the page changes.
  useEffect(() => setNavOpen(false), [route.kind === 'module' ? route.module.id : route.kind]);

  // `#/people` opens the group's first visible module; an empty address on an account without Overview opens its first page.
  const groupTarget = route.kind === 'group' ? modules.find((m) => m.group === route.group) : null;
  const redirect = groupTarget ? `#${groupTarget.route}` : route.kind === 'module' && !active && !window.location.hash.replace('#', '') && first ? `#${first.route}` : null;
  useEffect(() => {
    if (redirect) replace(redirect);
  }, [redirect, replace]);

  if (!first) {
    return (
      <div className="app app--solo">
        <main className="content">
          <h1>No access</h1>
          <p className="muted">This account has no dashboard areas. Ask an administrator to change its role.</p>
          <Button variant="secondary" onClick={onSignOut}>Sign out</Button>
        </main>
      </div>
    );
  }

  const canApprovals = access.canView('approvals');
  const approvalsModule = modules.find((m) => m.id === 'Approvals');
  const Page = active?.Component;
  const home = () => go(`#${first.route}`);
  // A module's sub-page (Users › Blocked devices) adds a crumb and names the page.
  const child = active ? childFor(active, route.rest) : null;
  const crumbs = active
    ? [
        ...active.breadcrumb.map((label, i, a) => {
          if (i === a.length - 1) return child ? { label, href: `#${active.route}` } : { label };
          const g = modules.find((m) => m.group === active.group);
          return { label, href: g ? `#${g.route}` : undefined };
        }),
        ...(child ? [{ label: child.title }] : []),
      ]
    : [{ label: 'Not found' }];
  const title = child ? child.title : active ? active.title : route.kind === 'module' ? route.module.title : "Page not found";

  return (
    <div className="app">
      <Sidebar modules={modules} currentId={active?.id} onSelect={go} online={online} me={me} onSignOut={onSignOut} open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="main">
        <TopBar
          environment={me.environment}
          canApprovals={canApprovals && !!approvalsModule}
          approvalsHref={approvalsModule ? `#${approvalsModule.route}` : '#'}
          onMenu={() => setNavOpen(true)}
          onSearch={() => setPaletteOpen(true)}
        />
        <main className="content" id="content">
          <header className="page-head">
            <Breadcrumbs items={crumbs} />
            <h1>{title}</h1>
          </header>
          {Page ? (
            <Page key={active.id} me={me} setOnline={setOnline} area={active.area} rest={route.rest} query={route.query} />
          ) : (
            <NotFound
              raw={route.kind === 'notfound' ? route.raw : ''}
              denied={route.kind === 'module'}
              title={route.kind === 'module' ? route.module.title : ''}
              firstHref={first.route}
              onHome={home}
            />
          )}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} modules={modules} access={access} onNavigate={go} />
    </div>
  );
}
