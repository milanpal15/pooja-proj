import { useEffect, useMemo, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useAccess } from '../../../lib/access/index.js';
import { MODULES } from '../../../lib/nav/registry.js';
import { useUnsavedGuard } from '../../../lib/hooks/useUnsavedGuard.js';
import { Banner, Button, Card, Field, ReadOnlyBadge, useConfirm, useToast } from '../../../ui/index.js';
import { escalationList, normalize, presets, samePerms, slugify, validateRole } from '../lib/matrix.js';
import { PermissionMatrix } from './PermissionMatrix.jsx';
import { RoleSees } from './RoleSees.jsx';

const LIST = '#/admin/roles';

/**
 * One role: name, description, the permission matrix and the live "This role will see" panel. Built-in roles open
 * read-only with a lock; "Duplicate to customise" makes an editable copy. Saving may be refused by the server
 * (`escalation`, `bad_role`), and each refusal is shown next to what caused it.
 */
export function RoleEditor({ role, isNew, roles, areas, canEdit, onDuplicate, onSaved }) {
  const toast = useToast();
  const confirm = useConfirm();
  const access = useAccess();
  const areaKeys = useMemo(() => areas.map((a) => a.key), [areas]);
  const start = useMemo(() => ({ key: role?.key ?? '', name: role?.name ?? '', description: role?.description ?? '', perms: normalize(role?.permissions ?? [], areaKeys) }), [role, areaKeys]);
  const [f, setF] = useState(start);
  const [keyTouched, setKeyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverErr, setServerErr] = useState({});
  const [escalation, setEscalation] = useState([]);
  const [preset, setPreset] = useState('');
  useEffect(() => setF(start), [start]);

  const builtin = !!role?.builtin;
  const readOnly = !canEdit || builtin;
  const dirty = !saved && (f.name !== start.name || f.description !== start.description || f.key !== start.key || !samePerms(f.perms, start.perms));
  useUnsavedGuard(dirty);
  useEffect(() => {
    if (saved) window.location.hash = LIST;
  }, [saved]);

  const errors = { ...serverErr, ...validateRole(f, { isNew, takenKeys: roles.map((r) => r.key) }) };
  const set = (patch) => {
    setServerErr({});
    setEscalation([]);
    setF((x) => ({ ...x, ...patch }));
  };
  const presetList = presets(roles);
  const canGrant = (area, col) => access.can(`${area}:${col}`);

  const applyPreset = async (key) => {
    setPreset(key);
    const p = presetList.find((x) => x.key === key);
    if (!p) return;
    if (f.perms.length && !samePerms(f.perms, normalize(p.permissions, areaKeys))) {
      const ok = await confirm({ title: `Start from ${p.name}`, message: 'This replaces the ticks in the matrix. Name and description stay.', confirmLabel: 'Replace ticks' });
      if (!ok) return setPreset('');
    }
    // Keep only what this operator may grant, so a preset never builds an escalation.
    set({ perms: normalize(p.permissions.filter((x) => access.can(x)), areaKeys) });
    setPreset('');
  };

  const save = async () => {
    setSaving(true);
    setServerErr({});
    setEscalation([]);
    try {
      const body = { name: f.name.trim(), description: f.description.trim(), permissions: f.perms };
      if (isNew) await api.roles.create({ key: f.key, ...body });
      else await api.roles.update(role.key, body);
      toast.success(isNew ? `Role “${body.name}” created` : `Role “${body.name}” saved`, { detail: 'Operators with this role pick it up within about 30 seconds.' });
      setSaved(true);
      onSaved();
    } catch (e) {
      if (e.code === 'escalation') {
        setEscalation(escalationList(e));
        toast.error('You can only grant permissions you hold yourself.');
      } else {
        setServerErr(e.body?.fields && !Array.isArray(e.body.fields) ? e.body.fields : {});
        toast.error(`Could not save the role. ${e.message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const valid = Object.keys(validateRole(f, { isNew, takenKeys: roles.map((r) => r.key) })).length === 0;
  return (
    <div className="role-editor">
      <div className="role-editor__main">
        <p><a className="rel-link" href={LIST}>← All roles</a></p>
        {builtin && (
          <Banner tone="warning" action={canEdit && <Button variant="outline" size="sm" onClick={() => onDuplicate(role)}>Duplicate to customise</Button>}>
            <span aria-hidden="true">🔒 </span><strong>Built-in role.</strong> It is a preset and cannot be changed or deleted. Duplicate it to make your own.
          </Banner>
        )}
        {escalation.length > 0 && (
          <Banner tone="error">
            You can only give permissions you hold yourself. Not allowed for you: <b>{escalation.join(', ')}</b>.
          </Banner>
        )}
        <Card title={isNew ? 'New role' : role.name} actions={readOnly && <ReadOnlyBadge />}>
          <div className="rel-form">
            <div className="rel-form__row">
              <Field label="Name" value={f.name} readOnly={readOnly} error={errors.name} onChange={(v) => set({ name: v, ...(isNew && !keyTouched ? { key: slugify(v) } : {}) })} placeholder="Content lead" />
              <Field label="Key" value={f.key} readOnly={!isNew || readOnly} error={errors.key} onChange={(v) => { setKeyTouched(true); set({ key: v.toLowerCase() }); }} hint={isNew ? 'Letters, digits, - and _. Cannot be changed later.' : 'The key never changes.'} />
            </div>
            <Field label="Description" type="textarea" rows={2} value={f.description} readOnly={readOnly} error={errors.description} onChange={(v) => set({ description: v })} hint={`${f.description.length} / 160. Shown when choosing a role for an operator.`} />
          </div>
        </Card>
        <Card title="Permissions" description="View lets an operator open a page. Edit also lets them change it. Edit includes View."
          actions={!readOnly && (
            <>
              <Field hideLabel label="Start from preset" type="select" className="ui-field--auto" value={preset} onChange={applyPreset}
                options={[{ value: '', label: 'Start from preset…' }, ...presetList.map((p) => ({ value: p.key, label: p.name }))]} />
              <Button variant="ghost" disabled={!f.perms.length} onClick={() => set({ perms: [] })}>Clear all</Button>
            </>
          )}>
          <PermissionMatrix areas={areas} perms={f.perms} areaKeys={areaKeys} onChange={(perms) => set({ perms })} readOnly={readOnly} canGrant={canGrant} />
        </Card>
        {!readOnly && (
          <div className="savebar savebar--inline" role="region" aria-label="Save role">
            <span className="savebar__text">{dirty ? <><strong>Unsaved changes.</strong> {f.perms.length} permission{f.perms.length === 1 ? '' : 's'} selected.</> : 'No changes yet.'}</span>
            <Button variant="secondary" disabled={saving} onClick={() => (window.location.hash = LIST)}>Cancel</Button>
            <Button loading={saving} disabled={!dirty || !valid} onClick={save}>{isNew ? 'Create role' : 'Save role'}</Button>
          </div>
        )}
      </div>
      <aside className="role-editor__side" aria-label="Preview">
        <RoleSees perms={f.perms} modules={MODULES} />
      </aside>
    </div>
  );
}
