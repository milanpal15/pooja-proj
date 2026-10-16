import { Badge, Card } from '../../../ui/index.js';
import { notableAbilities, previewModules } from '../lib/preview.js';

/** "This role will see": the sidebar the matrix grants, from the module registry, plus the abilities worth naming. */
export function RoleSees({ perms, modules }) {
  const { sections, count } = previewModules(perms, modules);
  const abilities = notableAbilities(perms);
  return (
    <Card title="This role will see" description={count ? `${count} page${count === 1 ? '' : 's'} in the sidebar.` : undefined} className="sees">
      {count === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Nothing yet. An operator with this role would see “No access”. Tick some areas on the left.</p>
      ) : (
        <div className="sees__nav" role="list" aria-label="Sidebar preview">
          {sections.map((s) => (
            <div key={s.key} role="listitem" className="sees__sec">
              {s.label && <div className="sees__group">{s.label}</div>}
              <ul>
                {s.items.map((i) => (
                  <li key={i.id}>
                    <span>{i.title}</span>
                    {i.mode === 'view' ? <Badge tone="outline">view only</Badge> : <Badge tone="success">can edit</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {abilities.length > 0 && (
        <>
          <h3 className="sees__h">Can also</h3>
          <ul className="sees__abil">{abilities.map((t) => <li key={t}>{t}</li>)}</ul>
        </>
      )}
    </Card>
  );
}
