import { useState } from 'react';

import { Button, Field, Modal } from '../../../ui/index.js';
import { TAGS_PER_USER, parseTags } from '../lib/tags.js';

/** Add one or more tags to every selected user (one request per user — there is no bulk endpoint). */
export function AddTagsModal({ count, hints = [], busy, onClose, onApply }) {
  const [text, setText] = useState('');
  const tags = parseTags(text);
  const submit = () => tags.length && onApply(tags);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Add tags to ${count} ${count === 1 ? 'user' : 'users'}`}
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!tags.length}>
            Add {tags.length > 1 ? 'tags' : 'tag'}
          </Button>
        </>
      }>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}>
        <Field label="Tags" value={text} onChange={setText} placeholder="vip, beta tester" list="usr-bulk-hints" autoComplete="off" hint={`Separate with commas. Lowercase, up to 24 characters; a user keeps at most ${TAGS_PER_USER} tags.`} />
        <datalist id="usr-bulk-hints">
          {hints.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {tags.length > 0 && (
          <p className="usr-preview-tags" aria-live="polite">
            Will add: {tags.map((t) => (
              <span key={t} className="ui-chip">{t}</span>
            ))}
          </p>
        )}
      </form>
    </Modal>
  );
}
