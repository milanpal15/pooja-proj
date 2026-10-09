import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { shiftDate } from '../../../lib/dates.js';
import { useConfirm } from '../../../ui/index.js';
import { isWritten } from '../lib/status.js';

/**
 * "Copy previous day" seeds a day from the one before and replaces the target
 * wholesale, so the app always sees one coherent editorial day. Asks first
 * when the target already has readings.
 */
export function useCopyPreviousDay({ date, written, reload, setMsg }) {
  const confirm = useConfirm();
  const [copying, setCopying] = useState(false);

  const copy = async () => {
    setCopying(true);
    setMsg('');
    try {
      const from = shiftDate(date, -1);
      const prev = await api.horoscopeDay(from);
      const n = prev.readings.filter(isWritten).length;
      if (!n) {
        setMsg(`Nothing published on ${from} to copy.`);
        return;
      }
      if (written) {
        const ok = await confirm({
          title: 'Replace readings',
          message: (
            <>
              {`${date} already has ${written} reading${written === 1 ? '' : 's'}.`}
              <br />
              <br />
              {`Replace them with the ${n} from ${from}?`}
            </>
          ),
          confirmLabel: 'Replace',
          tone: 'danger',
        });
        if (!ok) return;
      }
      const res = await api.saveHoroscopeDay(date, prev.readings);
      await reload();
      setMsg(
        `Copied ${res.saved} reading${res.saved === 1 ? '' : 's'} from ${from}` +
          (res.removed ? `, cleared ${res.removed}` : '') +
          ' — edit each one before it goes out.',
      );
    } catch (e) {
      setMsg(`Could not copy — ${e.message}`);
    } finally {
      setCopying(false);
    }
  };

  return { copy, copying };
}
