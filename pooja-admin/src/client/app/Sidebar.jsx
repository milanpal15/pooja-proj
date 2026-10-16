import { useEffect, useId, useState } from 'react';

import { readJson, writeJson } from '../lib/storage.js';
import { Button } from '../ui/index.js';
import { ApiStatus } from './ApiStatus.jsx';
import { NavItem } from './NavItem.jsx';
import { GROUPS } from './tab-areas.js';

const KEY = 'bhakti.nav.collapsed';

/**
 * The grouped, collapsible sidebar (docs/DASHBOARD_REVAMP.md §4). `modules` are already filtered to what the session
 * can view; a group with nothing visible is not drawn. Collapsed groups are remembered in this browser; navigating
 * into a collapsed group opens it. Below 900px it is a drawer (`open`), closed by the scrim, Esc or a navigation.
 */
export function Sidebar({ modules, currentId, onSelect, online, me, onSignOut, open, onClose }) {
  const [collapsed, setCollapsed] = useState(() => new Set(readJson(KEY, [])));
  const active = modules.find((m) => m.id === currentId);

  useEffect(() => {
    if (!active?.group) return;
    setCollapsed((c) => {
      if (!c.has(active.group)) return c;
      const n = new Set(c);
      n.delete(active.group);
      return n;
    });
  }, [active?.group]);
  useEffect(() => writeJson(KEY, [...collapsed]), [collapsed]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const toggle = (key) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const top = modules.filter((m) => !m.group);
  return (
    <>
      {open && <div className="sidebar-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`} aria-label="Dashboard navigation">
        <div className="brand">
          <span className="om">ॐ</span>
          <div>
            <div className="brand-title">Bhakti</div>
            <div className="brand-sub">Admin Portal</div>
          </div>
        </div>
        <nav>
          {top.map((m) => (
            <NavItem key={m.id} module={m} active={m.id === currentId} onSelect={onSelect} />
          ))}
          {GROUPS.map((g) => {
            const items = modules.filter((m) => m.group === g.key);
            if (!items.length) return null;
            return <NavGroup key={g.key} group={g} items={items} closed={collapsed.has(g.key)} currentId={currentId} onToggle={() => toggle(g.key)} onSelect={onSelect} />;
          })}
        </nav>
        <ApiStatus online={online} />
        {me && (
          <div className="whoami">
            {me.username} · {me.roleName || me.role}
          </div>
        )}
        <Button variant="secondary" className="sign-out" onClick={onSignOut}>
          Sign out
        </Button>
      </aside>
    </>
  );
}

function NavGroup({ group, items, closed, currentId, onToggle, onSelect }) {
  const id = useId();
  const hasActive = items.some((m) => m.id === currentId);
  return (
    <div className="nav-section">
      <button type="button" className={`nav-group-btn ${hasActive ? 'nav-group-btn--has-active' : ''}`} aria-expanded={!closed} aria-controls={id} onClick={onToggle}>
        <span>{group.label}</span>
        <span className={`nav-chev ${closed ? '' : 'nav-chev--open'}`} aria-hidden="true">
          ›
        </span>
      </button>
      {!closed && (
        <div id={id} className="nav-items">
          {items.map((m) => (
            <NavItem key={m.id} module={m} active={m.id === currentId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
