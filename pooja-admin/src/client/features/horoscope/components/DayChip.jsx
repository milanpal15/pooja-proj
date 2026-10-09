/** One day in the week strip: weekday, date, and how many of its twelve are written. */
export function DayChip({ day, onSelect }) {
  return (
    <button
      className={day.selected ? 'horo-wd sel' : 'horo-wd'}
      aria-current={day.selected ? 'date' : undefined}
      onClick={() => onSelect(day.key)}>
      <span className="dow">{day.dow}</span>
      <span className="num">{day.num}</span>
      <span className={day.filled === 12 ? 'cnt full' : 'cnt'}>{day.filled}/12</span>
    </button>
  );
}
