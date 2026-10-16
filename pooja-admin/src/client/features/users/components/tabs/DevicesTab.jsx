import { Badge, Button, DataTable } from '../../../../ui/index.js';
import { formatWhen } from '../../../../lib/dates.js';
import { versionLabel } from '../../lib/format.js';
import { SectionGate } from './SectionGate.jsx';

const pushOf = (d) => (d.hasPush ?? d.push) === undefined ? '—' : (d.hasPush ?? d.push) ? 'On' : 'Off';

/** Registered phones: build, Android API, model, first/last seen, push, and Block / Unblock this device. */
export function DevicesTab({ detail, canEdit, onBlock, onUnblock, onRetry }) {
  return (
    <SectionGate detail={detail} tab="devices" label="Devices" emptyTitle="No device on record" emptyText="This person has not opened the app on a phone since devices were recorded." onRetry={onRetry}>
      <DataTable label="Devices" minWidth={600}>
        <thead>
          <tr>
            <th scope="col">Device</th>
            <th scope="col">App version</th>
            <th scope="col">Android API</th>
            <th scope="col">First seen</th>
            <th scope="col">Last seen</th>
            <th scope="col">Push</th>
            {canEdit && <th scope="col"><span className="ui-sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {detail.devices.map((d) => (
            <tr key={d.deviceId}>
              <td>
                {d.model || d.platform || 'Unknown device'}
                <div className="sub"><code className="usr-code">{d.deviceId}</code></div>
              </td>
              <td>{versionLabel(d)}</td>
              <td>{d.osApi ?? '—'}</td>
              <td className="muted">{formatWhen(d.firstSeen)}</td>
              <td className="muted">{formatWhen(d.lastSeen)}</td>
              <td>{pushOf(d)}</td>
              {canEdit && (
                <td className="actions">
                  <div className="ui-actions">
                    {d.blocked && <Badge tone="danger">Blocked</Badge>}
                    <Button variant="outline" size="sm" aria-label={`${d.blocked ? 'Unblock' : 'Block'} device ${d.model || d.deviceId}`} onClick={() => (d.blocked ? onUnblock(d) : onBlock(d))}>
                      {d.blocked ? 'Unblock device' : 'Block device'}
                    </Button>
                  </div>
                </td>
              )}
              {!canEdit && d.blocked && null}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </SectionGate>
  );
}
