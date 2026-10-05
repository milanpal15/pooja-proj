import { useCallback, useEffect, useState } from 'react';

import { api } from './api.js';

/**
 * The Horoscope tab's day bar: pick the day, see how much of it is published,
 * and seed it from the day before.
 *
 * Horoscopes are twelve rows a day and most days are a reworking of the last,
 * so copying yesterday in and editing beats twelve blank modals. This is only
 * the copy step — every reading is written through the table's modal below,
 * which is the single place a reading is edited.
 *
 * Copy replaces the target day wholesale: a sign the previous day did not
 * publish is removed here too, so what the app sees is always one coherent
 * editorial day rather than a mix of two.
 */

const shiftDate = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const z = (x) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${z(dt.getMonth() + 1)}-${z(dt.getDate())}`;
};

const todayKey = () => {
  const n = new Date();
  const z = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${z(n.getMonth() + 1)}-${z(n.getDate())}`;
};

const countFilled = (readings) => readings.filter((r) => r.prediction || r.predictionHi).length;

export function HoroscopeCopyDay({
  date,
  onDateChange,
  allDates,
  onAllDatesChange,
  version,
  onCopied,
}) {
  const [filled, setFilled] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async (d) => {
    try {
      setFilled(countFilled((await api.horoscopeDay(d)).readings));
    } catch {
      setFilled(null);
    }
  }, []);

  // `version` is bumped by the table below, so adding or deleting a reading
  // there restates the counter here instead of leaving it stale.
  useEffect(() => {
    refresh(date);
  }, [date, version, refresh]);

  const copyPrevious = async () => {
    setBusy(true);
    setMsg('');
    try {
      const from = shiftDate(date, -1);
      const prev = await api.horoscopeDay(from);
      const n = countFilled(prev.readings);
      if (!n) {
        setMsg(`Nothing published on ${from} to copy.`);
        return;
      }
      if (
        filled &&
        !confirm(
          `${date} already has ${filled} reading${filled === 1 ? '' : 's'}.\n\n` +
            `Replace them with the ${n} from ${from}?`,
        )
      ) {
        return;
      }
      const res = await api.saveHoroscopeDay(date, prev.readings);
      await refresh(date);
      onCopied?.();
      setMsg(
        `Copied ${res.saved} reading${res.saved === 1 ? '' : 's'} from ${from}` +
          (res.removed ? `, cleared ${res.removed}` : '') +
          ' — edit each one below before it goes out.',
      );
    } catch (e) {
      setMsg(`Could not copy — ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="cm-head" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className="muted" htmlFor="horo-day">
          Day
        </label>
        <button className="btn small" onClick={() => onDateChange(shiftDate(date, -1))}>
          ‹
        </button>
        <input
          id="horo-day"
          type="date"
          value={date}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
          style={{ maxWidth: 170 }}
        />
        <button className="btn small" onClick={() => onDateChange(shiftDate(date, 1))}>
          ›
        </button>
        <button className="btn small" onClick={() => onDateChange(todayKey())}>
          Today
        </button>
        <button className="btn" disabled={busy} onClick={copyPrevious}>
          {busy ? 'Copying…' : 'Copy previous day'}
        </button>
        <label className="muted" style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <input
            type="checkbox"
            checked={!!allDates}
            onChange={(e) => onAllDatesChange(e.target.checked)}
          />
          Show all dates
        </label>
        <span className="muted">
          {filled === null ? '' : `${filled} of 12 published on ${date}`}
        </span>
      </div>
      <p className="muted">
        {msg ||
          'The table below shows this day only. “Copy previous day” brings the previous ' +
            'day’s twelve readings over as a starting point; a sign left unpublished shows ' +
            'an explicit “not published yet” in the app rather than an invented reading.'}
      </p>
    </div>
  );
}
