import { useMemo, useState } from 'react';

import { api } from '../../lib/api/index.js';
import { useAccess } from '../../lib/access/index.js';
import { formatDateTime, localInputToIso } from '../../lib/dates.js';
import { Banner, Button, ErrorState, ReadOnlyBadge, TableSkeleton, useConfirm, useToast } from '../../ui/index.js';
import { BlockBuildModal } from './components/BlockBuildModal.jsx';
import { ImpactCard } from './components/ImpactCard.jsx';
import { MaintenanceCard } from './components/MaintenanceCard.jsx';
import { PhonePreviewModal } from './components/PhonePreviewModal.jsx';
import { PolicyCard } from './components/PolicyCard.jsx';
import { ReleaseTimeline } from './components/ReleaseTimeline.jsx';
import { ReleaseWizard } from './components/ReleaseWizard.jsx';
import { useReleases } from './hooks/useReleases.js';
import { usePolicyEditor } from './hooks/usePolicyEditor.js';
import { toBody } from './lib/policy.js';
import { blankRelease, policyPatch, timeline, toReleaseBody } from './lib/release.js';

/**
 * App releases (docs/RELEASES.md §7), area `releases`: the build timeline, the version policy with a live Impact
 * preview, maintenance mode, and the two panic actions. A change that could lock people out may be answered "sent for
 * approval" instead of applied; the page says which happened. Without `releases:edit` every form is read-only.
 */
export function ReleasesPage({ area }) {
  const canEdit = useAccess().canEdit(area);
  const confirm = useConfirm();
  const toast = useToast();
  const data = useReleases();
  const editor = usePolicyEditor({ policy: data.policy, approvalsEnabled: data.approvalsEnabled, reload: data.reload });
  const [preview, setPreview] = useState(false);
  const [wizard, setWizard] = useState(null); // { initial, editing }
  const [blocking, setBlocking] = useState(null); // { code }

  const items = useMemo(() => timeline(data.releases, data.policy, data.usage), [data.releases, data.policy, data.usage]);
  const buildOptions = useMemo(() => {
    const m = new Map();
    for (const v of data.usage?.byVersion || []) m.set(v.versionCode, v.versionName ? `${v.versionName} (build ${v.versionCode})` : `build ${v.versionCode}`);
    for (const r of data.releases) if (r.status !== 'withdrawn') m.set(r.versionCode, `${r.versionName} (build ${r.versionCode})`);
    return [...m].sort((a, b) => b[0] - a[0]).map(([code, label]) => ({ code, label }));
  }, [data.usage, data.releases]);

  if (data.status === 'loading') return <div className="ui-page"><TableSkeleton rows={8} /></div>;
  if (data.status === 'error') return <div className="ui-page"><ErrorState message={data.error} offline={data.offline} onRetry={data.reload} /></div>;

  const baseBody = toBody(editor.baseline);
  const f = editor.form;
  const blockedNow = data.policy?.blockedVersionCodes || [];

  const turnMaintenanceOff = async () => {
    const ok = await confirm({
      title: 'Turn maintenance off',
      message: `Phones leave the maintenance screen right away.${editor.dirty ? ' Your unsaved edits on this page will be discarded.' : ''}`,
      confirmLabel: 'Turn maintenance off',
    });
    if (ok) editor.apply({ ...baseBody, maintenance: { ...baseBody.maintenance, enabled: false } }, { applied: 'Maintenance turned off', failed: 'Could not turn maintenance off.' });
  };

  const blockBuild = async (code) => {
    const ok = await editor.apply({ ...baseBody, blockedVersionCodes: [...new Set([...blockedNow, code])].sort((a, b) => a - b) }, { applied: `Build ${code} blocked`, failed: `Could not block build ${code}.` });
    if (ok) setBlocking(null);
    else setBlocking((b) => b && { ...b });
  };

  const withdraw = async (r) => {
    const ok = await confirm({ title: 'Withdraw release', message: `Mark ${r.versionName} (build ${r.versionCode}) as withdrawn? It stays in the list but is no longer offered. This does not block it.`, confirmLabel: 'Withdraw', tone: 'danger' });
    if (!ok) return;
    try {
      await api.releases.withdraw(r._id);
      toast.success(`${r.versionName} withdrawn`);
      await data.reload();
    } catch (e) {
      toast.error(`Could not withdraw the release. ${e.message}`);
    }
  };

  const submitWizard = async (form) => {
    const body = toReleaseBody(form);
    if (wizard.editing) {
      await api.releases.update(wizard.initial._id, body);
      toast.success(`${body.versionName} saved`);
      setWizard(null);
      return data.reload();
    }
    await api.releases.create(body);
    toast.success(`Release ${body.versionName} registered`);
    const patch = policyPatch(form);
    setWizard(null);
    if (patch) {
      const next = { ...baseBody, ...patch, graceUntil: patch.graceUntil ? localInputToIso(patch.graceUntil) : baseBody.graceUntil };
      if (next.recommendedVersionCode != null && next.minVersionCode != null && next.recommendedVersionCode < next.minVersionCode) next.recommendedVersionCode = next.minVersionCode;
      await editor.apply(next, { applied: `Policy updated for ${body.versionName}`, failed: 'The release was registered, but the policy was not changed.' });
    } else {
      await data.reload();
    }
  };

  return (
    <div className="ui-page rel">
      <div className="rel-top">
        <p className="rel-top__lede">Decide which app builds may run, nudge people to update, and close the app for maintenance. Changes that could lock people out may need a second operator’s approval.</p>
        {!canEdit && <ReadOnlyBadge />}
        {canEdit && (
          <div className="ui-actions">
            {data.policy?.maintenance?.enabled && <Button variant="outline" onClick={turnMaintenanceOff}>Turn maintenance off</Button>}
            <Button variant="outline" onClick={() => setBlocking({ code: null })}>Block a build…</Button>
          </div>
        )}
      </div>

      {data.pending.map((p) => (
        <Banner key={p._id} tone="warning" action={<a className="rel-link" href={`#/admin/approvals/${p._id}`}>Open request</a>}>
          <strong>Waiting for approval.</strong> {p.summary || 'A policy change'} — requested by {p.requestedBy}
          {p.expiresAt ? `, expires ${formatDateTime(p.expiresAt)}` : ''}. Nothing has changed yet.
        </Banner>
      ))}
      {editor.sent && !data.pending.some((p) => p._id === editor.sent._id) && (
        <Banner tone="warning" action={<Button variant="outline" size="sm" onClick={editor.dismissSent}>Dismiss</Button>}>
          <strong>Sent for approval.</strong> {editor.sent.summary || 'Your change'} will apply once another operator approves it (within 24 hours). Nothing has changed yet.
        </Banner>
      )}
      {!data.approvalsEnabled && <Banner tone="warning">Approvals are switched off, so risky changes apply immediately.</Banner>}

      <div className="ui-row rel-cols">
        <PolicyCard f={f} set={editor.set} errors={editor.errors} readOnly={!canEdit} releases={data.releases} onPreview={() => setPreview(true)} />
        <ImpactCard impact={editor.impact} hyp={editor.hyp} usage={data.usage} />
      </div>
      <MaintenanceCard m={f.maintenance} set={editor.setMaintenance} errors={editor.errors} readOnly={!canEdit} activeNow={!!data.policy?.maintenance?.enabled} />
      <ReleaseTimeline items={items} readOnly={!canEdit} onNew={() => setWizard({ initial: blankRelease(data.policy?.storeUrl || ''), editing: false })} onEdit={(r) => setWizard({ initial: { ...blankRelease(), ...r, versionCode: String(r.versionCode), notes: r.notes || '', notesHi: r.notesHi || '', storeUrl: r.storeUrl || '' }, editing: true })} onWithdraw={withdraw} onBlock={(r) => setBlocking({ code: r.versionCode })} />

      {canEdit && editor.dirty && (
        <div className="savebar" role="region" aria-label="Unsaved changes">
          <span className="savebar__text">
            <strong>Unsaved changes.</strong>{' '}
            {editor.risks.length ? (editor.needsApproval ? `This ${editor.risks.join(' and ')}, so it needs another operator’s approval.` : `This ${editor.risks.join(' and ')}.`) : 'These only relax or tidy the policy and apply at once.'}
          </span>
          <Button variant="secondary" disabled={editor.saving} onClick={editor.discard}>Discard</Button>
          <Button loading={editor.saving} disabled={!editor.valid} onClick={editor.save}>{editor.needsApproval ? 'Request approval ▸' : 'Save changes'}</Button>
        </div>
      )}

      {preview && <PhonePreviewModal form={f} onClose={() => setPreview(false)} />}
      {wizard && <ReleaseWizard initial={wizard.initial} editing={wizard.editing} existingCodes={data.releases.map((r) => r.versionCode)} defaultStoreUrl={data.policy?.storeUrl || ''} onClose={() => setWizard(null)} onSubmit={submitWizard} />}
      {blocking && <BlockBuildModal code={blocking.code} options={buildOptions} currentBlocked={blockedNow} currentPolicy={data.policy} onClose={() => setBlocking(null)} onConfirm={blockBuild} />}
    </div>
  );
}
