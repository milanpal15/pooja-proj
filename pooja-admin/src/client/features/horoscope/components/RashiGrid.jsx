import { RashiCard } from './RashiCard.jsx';

/** Twelve cards; owns the loading state. */
export function RashiGrid({ cards, loading, busyRow, readOnly = false, onEdit, onToggleVisible }) {
  return (
    <section className="horo-grid">
      {loading && <p className="muted">Loading…</p>}
      {!loading &&
        cards.map((c) => (
          <RashiCard
            key={c.value}
            card={c}
            busy={busyRow === c.row?._id}
            readOnly={readOnly}
            onEdit={onEdit}
            onToggleVisible={onToggleVisible}
          />
        ))}
    </section>
  );
}
