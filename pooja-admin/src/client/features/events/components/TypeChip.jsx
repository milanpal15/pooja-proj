/** A type's name as a small tinted chip, tinted by the type's own colour (data, never a switch on the slug). */
export function TypeChip({ type, fallback }) {
  const name = type?.name || fallback;
  if (!name) return <span>—</span>;
  const c = type?.color;
  return (
    <span className="ev-chip" style={c ? { '--ev': c } : undefined}>
      {name}
    </span>
  );
}
