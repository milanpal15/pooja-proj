import { useEffect } from 'react';

import { api } from '../../lib/api/index.js';
import { usePoll } from '../../lib/hooks/usePoll.js';
import { ErrorNote } from '../../ui/index.js';
import { SessionsChart } from './components/SessionsChart.jsx';
import { SummaryCards } from './components/SummaryCards.jsx';
import { TopScreens } from './components/TopScreens.jsx';

/** Also the dashboard's connectivity probe: reports whether the summary call worked. */
export function OverviewPage({ setOnline }) {
  const { data, err } = usePoll(() => api.summary(), [], 4000);
  const { data: trend } = usePoll(() => api.trend(), [], 10000);
  useEffect(() => setOnline(!err), [err, setOnline]);

  if (err) return <ErrorNote msg={err} />;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div className="ui-page">
      <SummaryCards data={data} />

      <div className="grid2">
        <SessionsChart trend={trend} />
        <TopScreens screens={data.topScreens} />
      </div>
    </div>
  );
}
