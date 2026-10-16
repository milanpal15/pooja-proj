import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useAccess } from '../../../lib/access/index.js';
import { formatDateTime, formatWhen } from '../../../lib/dates.js';
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, ReadOnlyBadge, TableSkeleton, useConfirm, useToast } from '../../../ui/index.js';
import { useBlockedDevices } from '../hooks/useBlockedDevices.js';
import { LIST_HASH } from '../lib/route.js';
import { BlockDeviceModal } from './BlockDeviceModal.jsx';

/** `#/people/users/blocked-devices`: every blocked device, add one by id, lift one. Read-only without devotees:edit. */
export function BlockedDevicesPage({ area }) {
  const canEdit = useAccess().canEdit(area);
  const { devices, status, error, offline, reload } = useBlockedDevices();
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const remove = async (d) => {
    const ok = await confirm({ title: 'Unblock this device', message: <>Remove the block on <code className="usr-code">{d.deviceId}</code>? Whoever uses it can open the app again.</>, confirmLabel: 'Unblock device' });
    if (!ok) return;
    try {
      await api.blockedDevices.remove(d.deviceId);
      toast.success('Device unblocked');
      reload();
    } catch (e) {
      toast.error(`Could not unblock the device. ${e.message}`);
    }
  };
  const add = async (body) => {
    await api.blockedDevices.add(body);
    setAdding(false);
    toast.success('Device blocked');
    reload();
  };

  return (
    <div className="ui-page">
      <a className="rel-link" href={LIST_HASH}>← All users</a>
      <Card flush>
        <div className="ui-toolbar">
          <span className="ui-toolbar__note">
            {status === 'ready' || status === 'stale' ? `${devices.length} blocked ${devices.length === 1 ? 'device' : 'devices'}` : 'Blocked devices'}
            <span className="muted"> · A device block is a deterrent. An account block is the control.</span>
          </span>
          {canEdit ? <Button onClick={() => setAdding(true)}>Block a device…</Button> : <ReadOnlyBadge />}
        </div>
        {status === 'loading' ? (
          <TableSkeleton rows={4} />
        ) : status === 'error' ? (
          <ErrorState message={error} offline={offline} onRetry={reload} />
        ) : devices.length === 0 ? (
          <EmptyState title="No blocked devices">Block a phone from a user’s Devices tab, or by its id here.</EmptyState>
        ) : (
          <DataTable label="Blocked devices" minWidth={760}>
            <thead>
              <tr>
                <th scope="col">Device id</th>
                <th scope="col">Reason</th>
                <th scope="col">Message shown</th>
                <th scope="col">Ends</th>
                <th scope="col">Blocked</th>
                {canEdit && <th scope="col"><span className="ui-sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.deviceId}>
                  <td><code className="usr-code">{d.deviceId}</code></td>
                  <td>{d.reason || '—'}</td>
                  <td className="usr-clip">{d.message || '—'}</td>
                  <td>{d.until ? formatDateTime(d.until) : <Badge tone="danger">Until unblocked</Badge>}</td>
                  <td className="muted">{[d.by, d.at && formatWhen(d.at)].filter(Boolean).join(' · ') || '—'}</td>
                  {canEdit && (
                    <td className="actions">
                      <div className="ui-actions">
                        <Button variant="outline" size="sm" aria-label={`Unblock device ${d.deviceId}`} onClick={() => remove(d)}>
                          Unblock
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
      {adding && <BlockDeviceModal onClose={() => setAdding(false)} onSubmit={add} />}
    </div>
  );
}
