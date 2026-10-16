import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { api } from '../lib/api/index.js';
import { rows } from '../lib/api/client.js';
import { childModules } from '../lib/nav/registry.js';
import { buildHash } from '../lib/nav/route.js';
import { buildSections, filterRecords, pushRecent } from '../lib/nav/palette.js';
import { readJson, writeJson } from '../lib/storage.js';

const RECENT_KEY = 'bhakti.palette.recent';
const LIST_TTL = 60000;

/**
 * ⌘K / Ctrl-K. Keyboard first: type, ↑/↓, Enter, Esc. Lists every module the session can view (and a module's
 * sub-pages, like Users › Blocked devices), and — for Users and Temples, when the session may view them — records:
 * users are searched on the server (`GET /admin/users?q=`, six at most, shown exactly as the API returned them: masked
 * for roles without access) and open that user's 360 at `#/people/users/<id>`; temples are fetched once and filtered
 * locally. Recents live in sessionStorage so a name is not left in the browser after the tab closes.
 */
export function CommandPalette({ open, onClose, modules, access, onNavigate }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState(() => readJson(RECENT_KEY, [], 'session'));
  const [lists, setLists] = useState({ users: null, temples: null });
  const [userHits, setUserHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const cache = useRef({ users: { at: 0, rows: null }, temples: { at: 0, rows: null } });
  const inputRef = useRef(null);
  const listId = useId();
  const canUsers = access.canView('devotees');
  const canTemples = access.canView('content');

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setDebounced('');
    setActive(0);
    setRecents(readJson(RECENT_KEY, [], 'session'));
    const trigger = document.activeElement;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      if (trigger instanceof HTMLElement && document.contains(trigger)) trigger.focus();
    };
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch the record lists the first time someone types (and again when stale).
  useEffect(() => {
    if (!open || debounced.trim().length < 2) return undefined;
    let dead = false;
    const need = [];
    const fresh = (k) => cache.current[k].rows && Date.now() - cache.current[k].at < LIST_TTL;
    if (canTemples && !fresh('temples')) need.push(['temples', async () => rows(await api.temples.list(), 'temples')]);
    if (!need.length) return undefined;
    setSearching(true);
    Promise.all(
      need.map(async ([k, fn]) => {
        try {
          cache.current[k] = { at: Date.now(), rows: rows(await fn(), k) };
        } catch {
          cache.current[k] = { at: Date.now(), rows: [] };
        }
      }),
    ).then(() => {
      if (dead) return;
      setLists({ users: cache.current.users.rows, temples: cache.current.temples.rows });
      setSearching(false);
    });
    return () => {
      dead = true;
    };
  }, [open, debounced, canUsers, canTemples]);

  // Users: asked of the server on every (debounced) query — never the whole list.
  useEffect(() => {
    const q = debounced.trim();
    if (!open || !canUsers || q.length < 2) {
      setUserHits([]);
      return undefined;
    }
    let dead = false;
    setSearching(true);
    api.users
      .page({ q, limit: 6 })
      .then((r) => !dead && setUserHits(r.users))
      .catch(() => !dead && setUserHits([]))
      .finally(() => !dead && setSearching(false));
    return () => {
      dead = true;
    };
  }, [open, debounced, canUsers]);

  const sections = useMemo(() => {
    const q = debounced.trim();
    const userItems = q.length >= 2 && canUsers
      ? userHits.map((u) => ({
          key: `u:${u.id}`,
          kind: 'record',
          title: u.name || u.contact || 'User',
          sub: u.name ? u.contact : u.method,
          route: '/people/users',
          rest: [u.id],
          query: {},
        }))
      : [];
    const templeHits =
      q.length >= 2 && canTemples
        ? filterRecords(lists.temples ?? cache.current.temples.rows ?? [], q, ['name', 'nameHi', 'slug', 'city', 'location']).map((t) => ({
            key: `t:${t._id ?? t.slug ?? t.name}`,
            kind: 'record',
            title: t.name || t.slug,
            sub: [t.city, t.state].filter(Boolean).join(', ') || 'Temple',
            route: '/content/temples',
            query: { q: t.name || t.slug },
          }))
        : [];
    return buildSections({ query: q, modules: q ? [...modules, ...childModules(modules)] : modules, recents, userHits: userItems, templeHits });
  }, [debounced, modules, recents, lists, userHits, canUsers, canTemples]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  useEffect(() => setActive(0), [debounced]);
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  if (!open) return null;

  const choose = (item) => {
    if (!item) return;
    const next = pushRecent(recents, item);
    setRecents(next);
    writeJson(RECENT_KEY, next, 'session');
    onClose();
    onNavigate(buildHash(item.route, item.rest ?? [], item.query));
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + flat.length - 1) % flat.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(flat[active]);
    } else if (e.key === 'Tab') {
      e.preventDefault(); // the input is the one stop; arrows move through results
    }
  };

  let index = -1;
  return createPortal(
    <div className="cmdk" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk__panel" role="dialog" aria-modal="true" aria-label="Search the dashboard" onKeyDown={onKeyDown}>
        <div className="cmdk__input">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page, or find a user or temple…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={flat.length ? `${listId}-${active}` : undefined}
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="cmdk__list" id={listId} role="listbox" aria-label="Results">
          {sections.map((s) => (
            <div key={s.key} role="group" aria-label={s.label}>
              <div className="cmdk__label">{s.label}</div>
              {s.items.map((item) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={item.key}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={`cmdk__item ${i === active ? 'cmdk__item--on' : ''}`}
                    onMouseMove={() => i !== active && setActive(i)}
                    onClick={() => choose(item)}>
                    <span className="cmdk__title">{item.title}</span>
                    {item.sub && <span className="cmdk__sub">{item.sub}</span>}
                    {item.kind === 'record' && <span className="cmdk__tag">Record</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && (
            <p className="cmdk__empty" role="status">
              {searching ? 'Searching…' : `Nothing matches "${debounced.trim()}".`}
            </p>
          )}
          {flat.length > 0 && searching && (
            <p className="cmdk__empty" role="status">
              Searching records…
            </p>
          )}
        </div>
        <div className="cmdk__foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to open
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
