import { useState } from 'react';

import { Button, Field, Modal } from '../../../ui/index.js';
import { VIEW_NAME_MAX } from '../lib/views.js';

/**
 * Saved views: a picker plus "Save current…". A view keeps filters, sort and columns in this browser — never the
 * search text (it can hold a name or a number). Applying one replaces the filters and clears the search.
 */
export function SavedViews({ views, onApply, onSave, onDelete }) {
  const [picked, setPicked] = useState('');
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const apply = (v) => {
    setPicked(v);
    const view = views.find((x) => x.name === v);
    if (view) onApply(view);
  };
  const save = () => {
    if (!name.trim()) return;
    onSave(name);
    setPicked(name.replace(/\s+/g, ' ').trim().slice(0, VIEW_NAME_MAX));
    setNaming(false);
    setName('');
  };
  return (
    <>
      <div className="usr-views">
        <Field hideLabel label="Saved views" type="select" value={picked} onChange={apply} className="ui-field--auto" options={[{ value: '', label: views.length ? 'Saved views…' : 'No saved views' }, ...views.map((v) => ({ value: v.name, label: v.name }))]} />
        <Button variant="outline" onClick={() => setNaming(true)}>
          Save view…
        </Button>
        {picked && (
          <Button
            variant="ghost"
            aria-label={`Delete saved view ${picked}`}
            onClick={() => {
              onDelete(picked);
              setPicked('');
            }}>
            Delete view
          </Button>
        )}
      </div>
      <Modal
        open={naming}
        onClose={() => setNaming(false)}
        size="sm"
        title="Save this view"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!name.trim()}>
              Save view
            </Button>
          </>
        }>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}>
          <Field label="Name" value={name} onChange={setName} maxLength={VIEW_NAME_MAX} placeholder="e.g. Blocked this week" hint="Saves the filters, sort and columns in this browser. The search box is not saved, and the name should not be a person’s name or number." />
        </form>
      </Modal>
    </>
  );
}
