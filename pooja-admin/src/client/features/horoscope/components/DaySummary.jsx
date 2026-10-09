import { ProgressBar } from '../../../ui/index.js';
import { StatusLegend } from './StatusLegend.jsx';

/** Progress for the day plus the status legend and the last message. */
export function DaySummary({ written, counts, msg }) {
  return (
    <>
      <div className="horo-progress">
        <div className="horo-bar">
          <div className="horo-bar-head">
            <span>{written} of 12 written</span>
            <span className="muted">{12 - written === 0 ? 'Day complete' : `${12 - written} still to write`}</span>
          </div>
          <ProgressBar value={written} max={12} label="Readings written for this day" />
        </div>
        <StatusLegend counts={counts} />
      </div>
      {msg && <p className="horo-msg">{msg}</p>}
    </>
  );
}
