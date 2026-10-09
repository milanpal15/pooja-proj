export function NavItem({ tab, active, onSelect }) {
  return (
    <button
      className={active ? 'nav active' : 'nav'}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(tab.id)}>
      {tab.id}
    </button>
  );
}
