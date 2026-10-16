/** Tags as small chips; at most `max` shown with a "+n". */
export function TagChips({ tags = [], max = 3 }) {
  if (!tags.length) return <span className="muted">—</span>;
  const shown = tags.slice(0, max);
  return (
    <span className="usr-tags">
      {shown.map((t) => (
        <span key={t} className="ui-chip">{t}</span>
      ))}
      {tags.length > max && <span className="usr-tags__more" title={tags.slice(max).join(', ')}>+{tags.length - max}</span>}
    </span>
  );
}
