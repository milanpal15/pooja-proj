import { useRef, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useUpload } from '../../../lib/hooks/useUpload.js';
import { idOf } from '../../../lib/ids.js';
import { Button, DataTable, EmptyState, Field, Modal, useConfirm, useToast } from '../../../ui/index.js';
import { badgeBody, badgeDraft, blankBadge, validateBadge } from '../lib/types.js';

/**
 * The badges an event can award. A list; Add/Edit open the form inside the same
 * dialog (a modal never opens another modal).
 */
export function BadgesModal({ canEdit, lookups, onClose }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { busy, upload } = useUpload();
  const fileRef = useRef(null);
  const [edit, setEdit] = useState(null); // { badge|null, draft }
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const badges = lookups.badges;
  const errors = edit ? validateBadge(edit.draft) : {};
  const set = (p) => setEdit((s) => ({ ...s, draft: { ...s.draft, ...p } }));

  const save = async () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const body = badgeBody(edit.draft, edit.badge);
      if (edit.badge) await api.eventBadges.update(idOf(edit.badge), body);
      else await api.eventBadges.create(body);
      toast.success(edit.badge ? 'Badge saved' : 'Badge added');
      setEdit(null);
      await lookups.reloadBadges();
    } catch (e) {
      toast.error(`Could not save. ${e.message}`);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (b) => {
    if (!(await confirm({ title: 'Delete badge', message: `Delete “${b.name}”? An event that awards it must be changed first.`, confirmLabel: 'Delete badge', tone: 'danger' }))) return;
    try {
      await api.eventBadges.remove(idOf(b));
      toast.success('Badge deleted');
      await lookups.reloadBadges();
    } catch (e) {
      toast.error(`Could not delete. ${e.message}`);
    }
  };
  const begin = (badge) => { setTried(false); setEdit({ badge, draft: badge ? badgeDraft(badge) : blankBadge() }); };

  if (edit) {
    const d = edit.draft;
    return (
      <Modal open size="sm" title={edit.badge ? 'Edit badge' : 'New badge'} onClose={() => setEdit(null)} dismissible={!saving}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Back</Button><Button loading={saving} onClick={save}>Save badge</Button></>}>
        <div className="hs-form">
          <Field label="Name" value={d.name} error={tried ? errors.name : undefined} onChange={(v) => set({ name: v })} />
          <Field label="Name (Hindi)" value={d.nameHi} onChange={(v) => set({ nameHi: v })} />
          <Field label="Description" type="textarea" value={d.description} onChange={(v) => set({ description: v })} />
          <div className="hs-upload">
            {d.art && <span className="lv-cover" style={{ backgroundImage: `url("${api.asset(d.art)}")` }} role="img" aria-label="Badge art" />}
            <Button variant="outline" loading={busy === 'art'} onClick={() => fileRef.current?.click()}>{d.art ? 'Replace art' : 'Upload art'}</Button>
            {d.art && <Button variant="outline" onClick={() => set({ art: '' })}>Remove</Button>}
            <input ref={fileRef} type="file" tabIndex={-1} aria-hidden="true" className="ui-filefield__input" accept="image/jpeg,image/png"
              onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { const url = await upload(f, 'art'); if (url) set({ art: url }); } }} />
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal open size="md" title="Badges" subtitle="Awarded when a devotee finishes an event" onClose={onClose}
      footer={canEdit ? <Button onClick={() => begin(null)}>+ New badge</Button> : <Button variant="secondary" onClick={onClose}>Close</Button>}>
      {badges.length === 0 ? (
        <EmptyState title="No badges yet">Create a badge, then choose it as a reward in an event.</EmptyState>
      ) : (
        <DataTable label="Badges" minWidth={420}>
          <thead><tr><th>Badge</th><th>Hindi</th>{canEdit && <th><span className="ui-sr-only">Actions</span></th>}</tr></thead>
          <tbody>
            {badges.map((b) => (
              <tr key={idOf(b) || b.slug}>
                <td><b>{b.name}</b>{b.description && <span className="lv-note">{b.description}</span>}</td>
                <td>{b.nameHi || '—'}</td>
                {canEdit && (
                  <td className="lv-actions">
                    <Button variant="outline" size="sm" onClick={() => begin(b)}>Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => remove(b)}>Delete</Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Modal>
  );
}
