/**
 * A row of tabs that switch a region of the page (not the dashboard's own
 * sidebar tabs). Arrow keys move between them.
 *
 * @typedef {Object} TabsProps
 * @property {string} label                              accessible name of the tab list
 * @property {Array<{id: string, label: string}>} tabs
 * @property {string} value                              the selected id
 * @property {(id: string) => void} onChange
 */
export function Tabs({ label, tabs, value, onChange }) {
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((t) => t.id === value);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    e.currentTarget.querySelector(`[data-tab="${next.id}"]`)?.focus();
  };
  return (
    <div className="ui-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-tab={t.id}
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          className="ui-tabs__tab"
          onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
