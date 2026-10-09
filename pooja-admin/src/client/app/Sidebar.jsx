import { Fragment } from 'react';

import { Button } from '../ui/index.js';
import { ApiStatus } from './ApiStatus.jsx';
import { NavItem } from './NavItem.jsx';

export function Sidebar({ tabs, current, onSelect, online, me, onSignOut }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="om">ॐ</span>
        <div>
          <div className="brand-title">Bhakti</div>
          <div className="brand-sub">Admin Portal</div>
        </div>
      </div>
      <nav>
        {tabs.map((t, i) => {
          const prev = tabs[i - 1];
          return (
            <Fragment key={t.id}>
              {t.group && t.group !== prev?.group && <div className="nav-group">{t.group}</div>}
              {!t.group && prev?.group && <div className="nav-group-end" role="presentation" />}
              <NavItem tab={t} active={t.id === current} onSelect={onSelect} />
            </Fragment>
          );
        })}
      </nav>
      <ApiStatus online={online} />
      {me && (
        <div className="whoami">
          {me.username} · {me.role}
        </div>
      )}
      <Button variant="secondary" className="sign-out" onClick={onSignOut}>
        Sign out
      </Button>
    </aside>
  );
}
