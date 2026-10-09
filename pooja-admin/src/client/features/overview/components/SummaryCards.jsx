import { StatCard, StatGrid } from '../../../ui/index.js';

export function SummaryCards({ data }) {
  const cards = [
    { label: 'Visitors', value: data.visitors },
    { label: 'Sessions', value: data.sessions },
    { label: 'Screen Views', value: data.screenViews },
  ];
  return (
    <StatGrid aria-label="Summary" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {cards.map((c) => (
        <StatCard key={c.label} label={c.label} value={c.value} tone="primary" />
      ))}
    </StatGrid>
  );
}
