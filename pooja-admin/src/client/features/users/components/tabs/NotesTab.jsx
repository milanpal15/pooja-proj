import { useEffect, useRef, useState } from 'react';

import { Button, Field, IconButton } from '../../../../ui/index.js';
import { useUnsavedGuard } from '../../../../lib/hooks/useUnsavedGuard.js';
import { formatWhen } from '../../../../lib/dates.js';
import { NOTE_MAX } from '../../lib/notes.js';
import { TAGS_PER_USER, parseTags } from '../../lib/tags.js';

/** Tags (add / remove) and operator notes (newest first). Read-only without devotees:edit. */
export function NotesTab({ user, canEdit, focusTick, onAddTags, onRemoveTag, onAddNote, onRemoveNote }) {
  const [tagText, setTagText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const noteRef = useRef(null);
  const tags = user.tags ?? [];
  const notes = user.notes ?? [];
  const pending = parseTags(tagText);
  const noteLeft = NOTE_MAX - [...note].length;
  useUnsavedGuard(note.trim() !== '' || tagText.trim() !== '');

  useEffect(() => {
    if (focusTick) noteRef.current?.focus();
  }, [focusTick]);

  const addTags = async (e) => {
    e.preventDefault();
    if (!pending.length) return;
    setBusy('tags');
    if (await onAddTags(pending)) setTagText('');
    setBusy('');
  };
  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim() || noteLeft < 0) return;
    setBusy('note');
    if (await onAddNote(note.trim())) setNote('');
    setBusy('');
  };

  return (
    <div className="usr-notes">
      <section aria-label="Tags">
        <h3 className="usr-subhead">Tags <span className="muted">({tags.length}/{TAGS_PER_USER})</span></h3>
        <div className="ui-chips" role="list" aria-label="Tags">
          {tags.length === 0 && <span className="ui-chips__none">None</span>}
          {tags.map((t) => (
            <span key={t} className="ui-chip" role="listitem">
              {t}
              {canEdit && (
                <button type="button" className="ui-chip__x" aria-label={`Remove tag ${t}`} onClick={() => onRemoveTag(t)}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {canEdit && (
          <form className="usr-inline" onSubmit={addTags}>
            <Field label="Add tags" value={tagText} onChange={setTagText} placeholder="vip, beta tester" autoComplete="off" hint="Separate with commas. Lowercase, up to 24 characters." />
            <Button type="submit" variant="outline" loading={busy === 'tags'} disabled={!pending.length}>
              Add
            </Button>
          </form>
        )}
      </section>

      <section aria-label="Notes">
        <h3 className="usr-subhead">Notes</h3>
        {canEdit && (
          <form onSubmit={addNote} className="usr-stack">
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="usr-note">Add a note (operators only)</label>
              <textarea id="usr-note" ref={noteRef} className="ui-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should the next operator know?" />
              <p className={`usr-count ${noteLeft < 0 ? 'usr-count--over' : ''}`}>{[...note].length} / {NOTE_MAX}</p>
            </div>
            <div>
              <Button type="submit" loading={busy === 'note'} disabled={!note.trim() || noteLeft < 0}>
                Save note
              </Button>
            </div>
          </form>
        )}
        {notes.length === 0 ? (
          <p className="muted">No notes yet.</p>
        ) : (
          <ul className="usr-notelist">
            {notes.map((n) => (
              <li key={n.id}>
                <p>{n.text}</p>
                <div className="usr-notelist__meta">
                  <span>{n.by} · {formatWhen(n.at)}</span>
                  {canEdit && (
                    <IconButton label={`Delete note by ${n.by}`} onClick={() => onRemoveNote(n)}>
                      ×
                    </IconButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
