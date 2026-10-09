import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { Button } from '../../../ui/index.js';
import { checkOutcome, checkedAgo, linkProblem } from '../lib/live.js';

/** "Test link": asks the API to probe the source now and says what came back. */
export function SourceCheck({ sourceType, url, savedCheckedAt, savedNote }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null); // { outcome, at }
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.liveStreams.check({ sourceType, url: url.trim() });
      setRes({ outcome: checkOutcome(r), at: new Date().toISOString() });
    } catch (e) {
      setRes({ outcome: { tone: 'bad', text: e.message || 'Could not check the link' }, at: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  };
  const ago = checkedAgo(res ? res.at : savedCheckedAt);
  const shown = res?.outcome || (savedNote ? { tone: 'warn', text: savedNote } : null);
  return (
    <div className="lv-check">
      <Button variant="outline" loading={busy} disabled={!!linkProblem(sourceType, url)} onClick={run}>Test link</Button>
      <span role="status" className={`lv-check__out lv-check__out--${shown?.tone || 'none'}`}>
        {shown ? `${shown.text}${ago ? ` · ${ago}` : ''}` : ago}
      </span>
    </div>
  );
}
