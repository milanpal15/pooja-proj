import { DayChip } from './DayChip.jsx';

export function WeekStrip({ week, onSelectDay }) {
  return (
    <div className="horo-week">
      {week.map((w) => (
        <DayChip key={w.key} day={w} onSelect={onSelectDay} />
      ))}
    </div>
  );
}
