/** `Releases & control › App releases`. `items`: [{ label, href? }]; the last is the current page. */
export function Breadcrumbs({ items }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} aria-current={i === items.length - 1 ? 'page' : undefined}>
            {c.href && i < items.length - 1 ? <a href={c.href}>{c.label}</a> : <span>{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
