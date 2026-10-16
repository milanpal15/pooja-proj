import { useEffect, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { idOf } from '../../../lib/ids.js';
import { useToast } from '../../../ui/index.js';
import { chunk } from '../lib/events.js';

const listOf = (r) => (Array.isArray(r) ? r : r?.events ?? []);
const MAX_STATS = 60;
const BATCH = 4; // stats requests in flight at once

/**
 * The events (newest first), the switch and delete made from the table, and
 * each event's stats. Stats come from their own endpoint and may be null
 * (unknown): a failed or null read stays null so the table shows "—".
 */
export function useEvents() {
  const toast = useToast();
  const list = useLoader(async () => listOf(await api.events.list()), { pollMs: 60000 });
  const events = (list.data || []).slice().sort((a, b) => String(b.schedule?.startsAt || b.createdAt || '').localeCompare(String(a.schedule?.startsAt || a.createdAt || '')));
  const [stats, setStats] = useState({});
  const ids = events.slice(0, MAX_STATS).map(idOf).filter(Boolean).join(',');

  useEffect(() => {
    let live = true;
    (async () => {
      for (const group of chunk(ids.split(',').filter(Boolean), BATCH)) {
        if (!live) return;
        await Promise.all(group.map(async (id) => {
          try {
            const s = await api.events.stats(id);
            if (live) setStats((m) => ({ ...m, [id]: s || {} }));
          } catch {
            if (live) setStats((m) => ({ ...m, [id]: {} }));
          }
        }));
      }
    })();
    return () => { live = false; };
  }, [ids]);

  const toggle = async (e) => {
    const next = !e.published;
    list.setData((rows) => rows.map((r) => (idOf(r) === idOf(e) ? { ...r, published: next } : r)));
    try {
      await api.events.update(idOf(e), { published: next });
      toast.success(next ? 'Event published' : 'Event hidden');
      list.reload();
    } catch (err) {
      // A 400 bad_event here is the "published must be valid and have a schedule" rule: say so.
      toast.error(`Could not ${next ? 'show' : 'hide'} this event. ${err.message}`);
      await list.reload();
    }
  };
  const remove = async (e) => {
    try {
      await api.events.remove(idOf(e));
    } catch (err) {
      toast.error(`Could not delete. ${err.message}`);
      return false;
    }
    toast.success('Event deleted');
    await list.reload();
    return true;
  };
  return { events, stats, status: list.status, error: list.error, offline: list.offline, reload: list.reload, toggle, remove };
}
