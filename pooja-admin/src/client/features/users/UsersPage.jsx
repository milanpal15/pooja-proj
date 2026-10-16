import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../lib/api/index.js';
import { useAccess } from '../../lib/access/index.js';
import { downloadCsv } from '../../lib/csv.js';
import { readJson, writeJson } from '../../lib/storage.js';
import { Banner, Button, Card, EmptyState, ErrorState, Field, ReadOnlyBadge, TableSkeleton, useConfirm, useToast } from '../../ui/index.js';
import { AddTagsModal } from './components/AddTagsModal.jsx';
import { BlockedDevicesPage } from './components/BlockedDevicesPage.jsx';
import { BulkBar } from './components/BulkBar.jsx';
import { ColumnChooser } from './components/ColumnChooser.jsx';
import { SavedViews } from './components/SavedViews.jsx';
import { UserFilters } from './components/UserFilters.jsx';
import { UserTable } from './components/UserTable.jsx';
import { UserView } from './components/UserView.jsx';
import { useUserList } from './hooks/useUserList.js';
import { exportFilename, exportPlan, selectionExportOk } from './lib/export.js';
import { DEFAULT_SORT, NO_FILTERS, countLabel, hasAnyFilter } from './lib/query.js';
import { DEVICES_HASH, LIST_HASH, parseUsersRoute } from './lib/route.js';
import { planAdd } from './lib/tags.js';
import { COLUMNS_KEY, DEFAULT_COLUMNS, VIEWS_KEY, makeView, removeView, sanitizeColumns, sanitizeViews, upsertView } from './lib/views.js';

/**
 * Users 360 (docs/USERS.md §5), area `devotees`. Routes under `#/people/users`:
 *   (nothing)            the list: server-side search / filters / sort, cursor paging, bulk bar, export, saved views
 *   <id>                 one user's 360 — a drawer over the list when the operator came from it, a full page on a deep link
 *   blocked-devices      the device blocklist
 * Names and contacts are never written to browser storage: saved views keep filters, sort and columns only.
 */
export function UsersPage({ area = 'devotees', rest = [], query = {} }) {
  // A user opens as a drawer over the list only when this page has already shown the list; arriving on a user's URL
  // (a deep link, the ⌘K palette, the Blocked devices page) shows that user as a full page.
  const listSeen = useRef(false);
  const route = parseUsersRoute(rest, query, { arrivedWithId: !listSeen.current });
  if (route.view === 'list') listSeen.current = true;
  const view = route;

  if (view.view === 'devices') return <BlockedDevicesPage area={area} />;
  return <UsersList area={area} view={view} query={query} />;
}

function UsersList({ area, view, query }) {
  const access = useAccess();
  const canEdit = access.canEdit(area);
  const toast = useToast();
  const confirm = useConfirm();

  const [filters, setFilters] = useState(() => ({ ...NO_FILTERS, q: query?.q ?? '' }));
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [columns, setColumns] = useState(() => sanitizeColumns(readJson(COLUMNS_KEY, null)));
  const [views, setViews] = useState(() => sanitizeViews(readJson(VIEWS_KEY, [])));
  const [selected, setSelected] = useState(() => new Set());
  const [bulk, setBulk] = useState(null); // 'tag' | 'export'
  const [busy, setBusy] = useState(false);
  const list = useUserList(filters, sort, { enabled: view.mode !== 'page' });

  useEffect(() => writeJson(COLUMNS_KEY, columns), [columns]);
  useEffect(() => writeJson(VIEWS_KEY, views), [views]);

  // Selection only ever holds ids that are still loaded.
  useEffect(() => {
    setSelected((s) => {
      const ids = new Set(list.rows.map((r) => r.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [list.rows]);

  const tagHints = useMemo(() => [...new Set(list.rows.flatMap((r) => r.tags ?? []))].sort(), [list.rows]);
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = (on) => setSelected(on ? new Set(list.rows.map((r) => r.id)) : new Set());

  const clearFilters = () => setFilters((f) => ({ ...NO_FILTERS, q: f.q }));
  const applyView = (v) => {
    setFilters({ ...NO_FILTERS, ...v.filters, q: '' });
    setSort(v.sort);
    setColumns(sanitizeColumns(v.columns));
  };
  const saveView = (name) => {
    const v = makeView(name, filters, sort, columns);
    if (!v) return;
    setViews((vs) => upsertView(vs, v));
    toast.success(`Saved view “${v.name}”`, { detail: 'Kept in this browser. The search text is not saved.' });
  };
  const deleteView = (name) => {
    setViews((vs) => removeView(vs, name));
    toast.success(`Deleted view “${name}”`);
  };

  /* ----------------------------------------------------------------- export -- */
  const runExport = useCallback(
    async (selectedOnly) => {
      const plan = exportPlan({ filters, sort, selectedIds: selectedOnly ? [...selected] : [], total: list.total });
      const ok = await confirm({
        title: plan.title,
        message: (
          <ul className="usr-plain">
            {plan.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ),
        confirmLabel: plan.confirmLabel,
      });
      if (!ok) return;
      setBusy(true);
      try {
        const text = await api.users.exportCsv(plan.query);
        if (plan.mode === 'selected' && !selectionExportOk(text, plan.count)) {
          toast.error('The export did not match your selection, so it was not saved.', { detail: 'Try exporting with filters instead, or ask for the server to support selected exports.' });
          return;
        }
        downloadCsv(exportFilename(new Date(), plan.mode), text);
        toast.success(plan.mode === 'selected' ? `Exported ${plan.count} ${plan.count === 1 ? 'user' : 'users'}` : 'Export downloaded', { detail: 'It is recorded in the audit log.' });
      } catch (e) {
        toast.error(`Could not export. ${e.message}`);
      } finally {
        setBusy(false);
      }
    },
    [filters, sort, selected, list.total, confirm, toast],
  );

  /* ------------------------------------------------------------- bulk tagging -- */
  const bulkTag = async (tags) => {
    setBusy(true);
    const targets = list.rows.filter((r) => selected.has(r.id));
    let done = 0;
    const failed = [];
    const queue = [...targets];
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        const plan = planAdd(r.tags, tags);
        if (plan.error) {
          failed.push(r);
          continue;
        }
        if (!plan.add.length) {
          done += 1;
          continue;
        }
        try {
          await api.users.tags(r.id, { add: plan.add });
          list.patchRow(r.id, { tags: [...(r.tags ?? []), ...plan.add] });
          done += 1;
        } catch {
          failed.push(r);
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setBusy(false);
    setBulk(null);
    if (failed.length) toast.error(`Tagged ${done} of ${targets.length}. ${failed.length} could not be tagged (a user is limited to 10 tags, or the request failed).`);
    else toast.success(`Added ${tags.join(', ')} to ${done} ${done === 1 ? 'user' : 'users'}`);
    if (!failed.length) setSelected(new Set());
  };

  /* ------------------------------------------------------------------- views -- */
  const openUser = view.view === 'detail' ? view : null;
  const close = () => {
    window.location.hash = LIST_HASH;
  };
  const filtered = hasAnyFilter(filters);

  const detail = openUser && (
    <UserView
      key={openUser.id}
      id={openUser.id}
      initialTab={openUser.tab}
      mode={openUser.mode}
      area={area}
      onClose={close}
      onChanged={(id, patch) => list.patchRow(id, patch)}
      onDeleted={(id) => {
        list.dropRow(id);
        close();
      }}
    />
  );
  if (openUser?.mode === 'page') return detail;

  return (
    <div className="ui-page">
      <Card flush>
        <div className="usr-toolbar">
          <Field hideLabel label="Search users" type="search" className="usr-search" value={filters.q} placeholder="Search name, phone, e-mail or user id" onChange={(q) => setFilters((f) => ({ ...f, q }))} autoComplete="off" />
          <div className="usr-toolbar__right">
            <SavedViews views={views} onApply={applyView} onSave={saveView} onDelete={deleteView} />
            <ColumnChooser value={columns} onChange={(c) => setColumns(sanitizeColumns(c))} />
            {canEdit && (
              <Button variant="outline" loading={busy && bulk === null} onClick={() => runExport(false)} disabled={list.status !== 'ready'}>
                Export CSV…
              </Button>
            )}
            <Button variant="ghost" onClick={() => (window.location.hash = DEVICES_HASH)}>
              Blocked devices
            </Button>
            {!canEdit && <ReadOnlyBadge />}
          </div>
        </div>
        <UserFilters filters={filters} onChange={setFilters} sort={sort} onSort={setSort} onClear={clearFilters} tagHints={tagHints} />

        {canEdit && selected.size > 0 && <BulkBar count={selected.size} busy={busy} onAddTag={() => setBulk('tag')} onExport={() => runExport(true)} onClear={() => setSelected(new Set())} />}

        {list.status === 'loading' ? (
          <TableSkeleton rows={8} />
        ) : list.status === 'error' ? (
          <ErrorState message={list.error} offline={list.offline} onRetry={list.reload} />
        ) : list.rows.length === 0 ? (
          <EmptyState title={filtered ? 'No users match' : 'No users yet'} action={filtered ? <Button variant="outline" size="sm" onClick={() => setFilters({ ...NO_FILTERS })}>Clear search and filters</Button> : undefined}>
            {filtered ? 'Try a different search or fewer filters.' : 'People appear here after they sign in on the app.'}
          </EmptyState>
        ) : (
          <>
            {list.error && (
              <div className="usr-pad">
                <Banner action={<Button size="sm" variant="secondary" onClick={list.loadMore}>Try again</Button>}>Couldn’t load more. {list.error}</Banner>
              </div>
            )}
            <UserTable rows={list.rows} columns={columns} sort={sort} onSort={setSort} selectable={canEdit} selected={selected} onToggle={toggle} onToggleAll={toggleAll} activeId={openUser?.id} busy={list.refreshing || list.typing} />
            <div className="usr-foot" role="status">
              <span>{countLabel(list)}</span>
              {list.next && (
                <Button variant="outline" loading={list.loadingMore} onClick={list.loadMore}>
                  Load more
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
      {bulk === 'tag' && <AddTagsModal count={selected.size} hints={tagHints} busy={busy} onClose={() => setBulk(null)} onApply={bulkTag} />}
      {detail}
    </div>
  );
}
