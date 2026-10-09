import { useState } from 'react';

import { useAccess } from '../../../lib/access/index.js';
import { api } from '../../../lib/api/index.js';
import { idOf } from '../../../lib/ids.js';
import { Button, Card, DataTable, EmptyState, Field, Modal, StatusText, Switch, useConfirm, useToast } from '../../../ui/index.js';
import { slugify } from '../lib/live.js';

const blank = () => ({ name: '', nameHi: '', enabled: true });

/** Live categories (Jyotirlinga, Shakti Peeth…): the groups the app filters its list by. */
export function CategoriesTab({ area, lookups, addRef }) {
  const canEdit = useAccess().canEdit(area);
  const toast = useToast();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(null); // { id|null, draft }
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const cats = lookups.categories;
  if (addRef) addRef.current = () => { setTried(false); setEdit({ id: null, draft: blank() }); };

  const save = async () => {
    setTried(true);
    const d = edit.draft;
    if (!d.name.trim()) return;
    setSaving(true);
    try {
      const body = { name: d.name.trim(), nameHi: d.nameHi.trim(), enabled: d.enabled };
      if (edit.id) await api.liveCategories.update(edit.id, body);
      else await api.liveCategories.create({ ...body, slug: slugify(d.name), order: Math.max(0, ...cats.map((c) => c.order ?? 0)) + 10 });
      toast.success('Category saved');
      setEdit(null);
      await lookups.reloadCategories();
    } catch (e) {
      toast.error(`Could not save. ${e.message}`);
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (c) => {
    try {
      await api.liveCategories.update(idOf(c), { enabled: c.enabled === false });
      await lookups.reloadCategories();
    } catch (e) {
      toast.error(`Could not change that. ${e.message}`);
    }
  };
  const remove = async (c) => {
    if (!(await confirm({ title: 'Delete category', message: `Delete “${c.name}”? Streams in it keep playing but lose the category.`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    try {
      await api.liveCategories.remove(idOf(c));
      toast.success('Category deleted');
      await lookups.reloadCategories();
    } catch (e) {
      toast.error(`Could not delete. ${e.message}`);
    }
  };
  const set = (p) => setEdit((s) => ({ ...s, draft: { ...s.draft, ...p } }));

  return (
    <>
      {cats.length === 0 ? (
        <Card><EmptyState title="No categories">Categories group streams in the app, such as Jyotirlinga or Ganga Aarti.</EmptyState></Card>
      ) : (
        <Card flush>
          <DataTable label="Live darshan categories" minWidth={420}>
            <thead><tr><th>Category</th><th>Hindi</th><th>Show</th>{canEdit && <th><span className="ui-sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {cats.map((c) => (
                <tr key={idOf(c)}>
                  <td><b>{c.name}</b></td>
                  <td>{c.nameHi || '—'}</td>
                  <td>{canEdit ? <Switch label={`Show ${c.name}`} checked={c.enabled !== false} onChange={() => toggle(c)} /> : <StatusText on={c.enabled !== false} onLabel="Shown" offLabel="Hidden" />}</td>
                  {canEdit && (
                    <td className="lv-actions">
                      <Button variant="outline" size="sm" onClick={() => { setTried(false); setEdit({ id: idOf(c), draft: { name: c.name || '', nameHi: c.nameHi || '', enabled: c.enabled !== false } }); }}>Edit</Button>
                      <Button variant="outline" size="sm" onClick={() => remove(c)}>Delete</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      )}
      {edit && (
        <Modal open size="sm" title={edit.id ? 'Edit category' : 'New category'} onClose={() => setEdit(null)} dismissible={!saving}
          footer={<Button loading={saving} onClick={save}>Save category</Button>}>
          <div className="hs-form">
            <Field label="Name" value={edit.draft.name} error={tried && !edit.draft.name.trim() ? 'Add a name' : undefined} onChange={(v) => set({ name: v })} />
            <Field label="Name (Hindi)" value={edit.draft.nameHi} onChange={(v) => set({ nameHi: v })} />
            <Switch variant="card" label="Shown in the app" checked={edit.draft.enabled} onChange={(v) => set({ enabled: v })} />
          </div>
        </Modal>
      )}
    </>
  );
}
