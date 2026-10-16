/** One sidebar link. A real anchor, so middle-click / copy-link work; a plain click goes through the router (and its unsaved-work guard). */
export function NavItem({ module: m, active, onSelect }) {
  return (
    <a
      className={active ? 'nav active' : 'nav'}
      href={`#${m.route}`}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onSelect(`#${m.route}`);
      }}>
      {m.title}
    </a>
  );
}
