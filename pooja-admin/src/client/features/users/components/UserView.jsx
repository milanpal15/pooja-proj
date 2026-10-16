import { useEffect, useState } from 'react';

import { AdjustWalletForm } from '../../coins/index.js';
import { api } from '../../../lib/api/index.js';
import { useAccess } from '../../../lib/access/index.js';
import { Badge, Banner, Button, Drawer, ErrorState, Modal, Skeleton, Tabs, useConfirm, useToast } from '../../../ui/index.js';
import { formatDay } from '../../../lib/dates.js';
import { useUserDetail } from '../hooks/useUserDetail.js';
import { TABS, tabLabel } from '../lib/detail.js';
import { displayName, isBlocked, roleLabel, rowPatch, statusOf } from '../lib/format.js';
import { LIST_HASH, userHash } from '../lib/route.js';
import { planAdd } from '../lib/tags.js';
import { Avatar } from './Avatar.jsx';
import { BlockDeviceModal } from './BlockDeviceModal.jsx';
import { BlockModal } from './BlockModal.jsx';
import { DeleteUserModal } from './DeleteUserModal.jsx';
import { UnblockModal } from './UnblockModal.jsx';
import { TabSkeleton } from './tabs/SectionGate.jsx';
import { ActivityTab } from './tabs/ActivityTab.jsx';
import { DevicesTab } from './tabs/DevicesTab.jsx';
import { BookingsTab, CallsTab, EventsTab } from './tabs/ListTabs.jsx';
import { NotesTab } from './tabs/NotesTab.jsx';
import { ProfileTab } from './tabs/ProfileTab.jsx';
import { WalletTab } from './tabs/WalletTab.jsx';

/**
 * One user's 360, as a right-hand drawer over the list (`mode="drawer"`) or a full page (`mode="page"`, a deep link).
 * Everything the operator can do is gated by `<area>:edit` (read-only without it); data is shown as the API sent it.
 */
export function UserView({ id, initialTab, mode, area, onClose, onChanged, onDeleted }) {
  const access = useAccess();
  const canEdit = access.canEdit(area);
  const toast = useToast();
  const confirm = useConfirm();
  const { detail, status, error, offline, reload, setDetail } = useUserDetail(id);
  const [tab, setTab] = useState(initialTab);
  const [focusTick, setFocusTick] = useState(0);
  const [modal, setModal] = useState(null); // 'block' | 'unblock' | 'delete' | 'adjust' | { device }
  const u = detail?.user;
  const blocked = isBlocked(u);
  const devices = detail?.devices ?? [];
  const blockedDevices = devices.filter((d) => d.blocked).length;

  useEffect(() => setTab(initialTab), [id, initialTab]);

  const goTab = (next) => {
    setTab(next);
    // Keep the address shareable without adding a history entry per tab click.
    window.history.replaceState(null, '', userHash(id, { tab: next, page: mode === 'page' }));
  };

  const name = u ? displayName(u) : 'this user';
  /** Run a write; toast the outcome; true on success. */
  const act = async (work, ok, fail) => {
    try {
      const r = await work();
      toast.success(typeof ok === 'function' ? ok(r) : ok);
      return r ?? true;
    } catch (e) {
      toast.error(`${fail} ${e.message}`);
      return false;
    }
  };
  /** Fold the API's returned user into what is on screen and tell the list. */
  const apply = (res) => {
    const next = res?.user;
    if (next) {
      setDetail((d) => (d ? { ...d, user: { ...d.user, ...next } } : d));
      onChanged?.(id, rowPatch({ ...u, ...next }));
    }
    return reload();
  };

  const doBlock = async (body) => {
    const res = await api.users.block(id, body); // throws into the modal so it can show field errors
    setModal(null);
    toast.success(u?.block?.active ? `Block on ${name} updated` : `${name} blocked. They are signed out.`, body.alsoBlockDevices ? { detail: 'Their devices are blocked too.' } : undefined);
    await apply(res);
  };
  const doUnblock = async (body) => {
    const res = await api.users.unblock(id, body);
    setModal(null);
    toast.success(`${name} unblocked`);
    await apply(res);
  };
  const doSignOut = async () => {
    const ok = await confirm({ title: `Sign ${name} out`, message: 'Their session ends the next time the app refreshes it, and they land on the login screen. They can sign in again.', confirmLabel: 'Force sign-out' });
    if (!ok) return;
    await act(() => api.users.signOut(id), `${name} will be signed out`, 'Could not sign them out.');
    reload();
  };
  const doDelete = async (typed) => {
    await api.users.remove(id, typed);
    setModal(null);
    toast.success(`${name} deleted`);
    onDeleted?.(id);
  };
  const doDeviceBlock = async (body) => {
    await api.blockedDevices.add(body);
    setModal(null);
    toast.success('Device blocked');
    await reload();
  };
  const doDeviceUnblock = async (d) => {
    const ok = await confirm({ title: 'Unblock this device', message: `${d.model || d.deviceId} will be able to use the app again.`, confirmLabel: 'Unblock device' });
    if (!ok) return;
    if (await act(() => api.blockedDevices.remove(d.deviceId), 'Device unblocked', 'Could not unblock the device.')) reload();
  };

  const addTags = async (tags) => {
    const plan = planAdd(u.tags, tags);
    if (plan.error) {
      toast.error(plan.error);
      return false;
    }
    if (!plan.add.length) {
      toast.info('Those tags are already on this user');
      return true;
    }
    const ok = await act(() => api.users.tags(id, { add: plan.add }), `Added ${plan.add.join(', ')}`, 'Could not add the tags.');
    if (ok) {
      const next = [...(u.tags ?? []), ...plan.add];
      setDetail((d) => ({ ...d, user: { ...d.user, tags: next } }));
      onChanged?.(id, { tags: next });
      reload();
    }
    return !!ok;
  };
  const removeTag = async (t) => {
    if (await act(() => api.users.tags(id, { remove: [t] }), `Removed ${t}`, 'Could not remove the tag.')) {
      const next = (u.tags ?? []).filter((x) => x !== t);
      setDetail((d) => ({ ...d, user: { ...d.user, tags: next } }));
      onChanged?.(id, { tags: next });
    }
  };
  const addNote = async (text) => {
    const ok = await act(() => api.users.addNote(id, text), 'Note saved', 'Could not save the note.');
    if (ok) await reload();
    return !!ok;
  };
  const removeNote = async (n) => {
    const ok = await confirm({ title: 'Delete this note', message: `“${n.text.slice(0, 120)}${n.text.length > 120 ? '…' : ''}”`, confirmLabel: 'Delete note', tone: 'danger' });
    if (ok && (await act(() => api.users.removeNote(id, n.id), 'Note deleted', 'Could not delete the note.'))) reload();
  };

  const retry = () => reload();

  /* ---------------------------------------------------------------- chrome -- */
  const s = u ? statusOf(u) : null;
  const subtitle = u ? (
    <span className="usr-sub">
      <span>{u.contact || '—'}</span>
      <span aria-hidden="true">·</span>
      <span>{roleLabel(u.role)}</span>
      <Badge tone={s.tone}>{s.label}</Badge>
    </span>
  ) : (
    <Skeleton width="220px" height="1em" />
  );
  const actions = u && (
    <div className="usr-actions" role="group" aria-label="Actions">
      {canEdit && (blocked ? (
        <>
          <Button variant="outline" size="sm" onClick={() => setModal('unblock')}>Unblock</Button>
          <Button variant="outline" size="sm" onClick={() => setModal('block')}>Edit block…</Button>
        </>
      ) : (
        <Button variant="danger-solid" size="sm" onClick={() => setModal('block')}>Block…</Button>
      ))}
      {canEdit && <Button variant="outline" size="sm" onClick={doSignOut}>Force sign-out</Button>}
      {canEdit && (
        <Button variant="outline" size="sm" onClick={() => { goTab('notes'); setFocusTick((t) => t + 1); }}>
          Add note / tag
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => goTab('wallet')}>Open wallet</Button>
      {canEdit && <Button variant="danger" size="sm" onClick={() => setModal('delete')}>Delete…</Button>}
      {mode === 'drawer' && <a className="usr-fulllink" href={userHash(id, { tab, page: true })}>Open full page</a>}
      {!canEdit && <Badge tone="outline">View only</Badge>}
    </div>
  );
  const strip = blocked && u?.block && (
    <div className="usr-strip">
      <Banner
        tone="error"
        action={canEdit ? <Button size="sm" variant="secondary" onClick={() => setModal('unblock')}>Unblock now</Button> : null}>
        <b>Blocked{u.block.until ? ` until ${formatDay(u.block.until)}` : ''}.</b> {u.block.message ? <>They read: “{u.block.message}”</> : 'No message was set.'}
      </Banner>
    </div>
  );
  const tabs = (
    <Tabs
      label="User sections"
      value={tab}
      onChange={goTab}
      tabs={TABS.map((t) => ({ id: t.id, label: tabLabel(detail, t.id) }))}
    />
  );

  const body = (() => {
    if (status === 'loading') return <TabSkeleton />;
    if (status === 'error') {
      return error && /not found|404/i.test(error) ? (
        <div className="ui-state"><p className="ui-state__title">That user doesn’t exist</p><p className="ui-state__body">They may have been deleted.</p><a className="rel-link" href={LIST_HASH}>Back to all users</a></div>
      ) : (
        <ErrorState message={error} offline={offline} onRetry={reload} />
      );
    }
    const common = { detail, onRetry: retry };
    return (
      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label} className="usr-tabbody">
        {tab === 'profile' && <ProfileTab detail={detail} />}
        {tab === 'devices' && <DevicesTab {...common} canEdit={canEdit} onBlock={(d) => setModal({ device: d })} onUnblock={doDeviceUnblock} />}
        {tab === 'wallet' && <WalletTab {...common} canAdjust={access.canEdit('wallets') && !!detail.wallet && !detail.wallet.unavailable} onAdjust={() => setModal('adjust')} />}
        {tab === 'bookings' && <BookingsTab {...common} />}
        {tab === 'events' && <EventsTab {...common} />}
        {tab === 'calls' && <CallsTab {...common} />}
        {tab === 'activity' && <ActivityTab {...common} />}
        {tab === 'notes' && <NotesTab user={u} canEdit={canEdit} focusTick={focusTick} onAddTags={addTags} onRemoveTag={removeTag} onAddNote={addNote} onRemoveNote={removeNote} />}
      </div>
    );
  })();

  const modals = u && (
    <>
      {modal === 'block' && <BlockModal user={u} deviceCount={devices.length} onClose={() => setModal(null)} onSubmit={doBlock} />}
      {modal === 'unblock' && <UnblockModal user={u} blockedDevices={blockedDevices} onClose={() => setModal(null)} onSubmit={doUnblock} />}
      {modal === 'delete' && <DeleteUserModal user={u} onClose={() => setModal(null)} onSubmit={doDelete} />}
      {modal?.device && <BlockDeviceModal deviceId={modal.device.deviceId} onClose={() => setModal(null)} onSubmit={doDeviceBlock} />}
      {modal === 'adjust' && detail.wallet && !detail.wallet.unavailable && (
        <Modal open onClose={() => setModal(null)} title="Adjust coins" subtitle={name}>
          <AdjustWalletForm
            initialWallet={{ uid: u.uid, name: u.name, contact: u.contact, balance: detail.wallet.balance }}
            onAdjusted={() => {
              setModal(null);
              reload();
            }}
          />
        </Modal>
      )}
    </>
  );

  if (mode === 'drawer') {
    return (
      <>
        <Drawer open onClose={onClose} title={u ? name : 'Loading…'} lead={u ? <Avatar user={u} size={48} /> : <Skeleton width="48px" height="48px" />} subtitle={subtitle} actions={actions} header={<>{strip}{tabs}</>}>
          {body}
        </Drawer>
        {modals}
      </>
    );
  }
  return (
    <div className="ui-page">
      <a className="rel-link" href={LIST_HASH}>← All users</a>
      <section className="ui-card usr-page">
        <header className="usr-page__head">
          <div className="usr-page__id">
            {u ? <Avatar user={u} size={56} /> : <Skeleton width="56px" height="56px" />}
            <div>
              <h2 className="usr-page__name">{u ? name : 'Loading…'}</h2>
              {subtitle}
            </div>
          </div>
          {actions}
          {strip}
        </header>
        {tabs}
        <div className="usr-page__body">{body}</div>
      </section>
      {modals}
    </div>
  );
}
