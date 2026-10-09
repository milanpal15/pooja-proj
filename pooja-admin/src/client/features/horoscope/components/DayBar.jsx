import { Button, Field, IconButton, ReadOnlyBadge, Switch } from '../../../ui/index.js';
import { longDate, shiftDate, todayKey } from '../../../lib/dates.js';

/** ‹ date › Today · picker · [Show all dates] [Copy previous day] */
export function DayBar({ date, allDates = false, readOnly = false, onDateChange, onAllDates, copying, onCopy }) {
  return (
    <div className="horo-daybar">
      <div className="horo-nav">
        <IconButton label="Previous day" onClick={() => onDateChange(shiftDate(date, -1))}>
          ‹
        </IconButton>
        <div>
          <div className="horo-date">{longDate(date)}</div>
          <div className="horo-sub">{readOnly ? 'Viewing this day' : 'Editing this day'}</div>
        </div>
        <IconButton label="Next day" onClick={() => onDateChange(shiftDate(date, 1))}>
          ›
        </IconButton>
        <Button variant="secondary" onClick={() => onDateChange(todayKey())}>
          Today
        </Button>
        <Field
          hideLabel
          type="date"
          label="Pick a date"
          className="horo-datepick"
          value={date}
          onChange={(v) => v && onDateChange(v)}
        />
      </div>
      <div className="horo-tools">
        <Switch variant="card" label="Show all dates" checked={allDates} onChange={onAllDates} />
        {readOnly ? (
          <ReadOnlyBadge />
        ) : (
          <Button loading={copying} onClick={onCopy}>
            {copying ? 'Copying…' : 'Copy previous day'}
          </Button>
        )}
      </div>
    </div>
  );
}
