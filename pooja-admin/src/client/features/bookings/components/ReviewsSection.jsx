import { useState } from 'react';

import { useAccess } from '../../../lib/access/index.js';
import { idOf } from '../../../lib/ids.js';
import { Badge, Button, Card, DataTable, Field, Modal, ReadoutField } from '../../../ui/index.js';
import { useReviews } from '../hooks/useBookings.js';
import { REVIEW_MAX, accountOf, reviewTextOk, stars } from '../lib/bookings.js';
import { ListStates } from './ListStates.jsx';

const VISIBILITY = [
  { value: '', label: 'Shown: All' },
  { value: 'false', label: 'Visible only' },
  { value: 'true', label: 'Hidden only' },
];

/** Edit a review's wording. The rating and the devotee's name belong to the devotee and stay as written. */
function EditReviewModal({ review, saving, onSave, onClose }) {
  const [text, setText] = useState(review.text || '');
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      title="Edit review"
      subtitle={`${review.poojaTitle} · ${review.bookingRef}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!reviewTextOk(text, review.text)} onClick={() => onSave(text.trim())}>
            Save
          </Button>
        </>
      }>
      <ReadoutField label="Devotee">{accountOf(review)}</ReadoutField>
      <ReadoutField label="Rating">
        <span className="bk-stars" role="img" aria-label={`${review.rating} out of 5`}>
          {stars(review.rating)}
        </span>
      </ReadoutField>
      <Field
        label="Review text"
        type="textarea"
        rows={5}
        maxLength={REVIEW_MAX}
        value={text}
        onChange={setText}
        hint={`${text.length} / ${REVIEW_MAX}. The rating and the name cannot be changed.`}
      />
    </Modal>
  );
}

/** Reviews can be hidden, shown or reworded — never re-rated or renamed — and only a devotee with a performed booking can write one. */
export function ReviewsSection() {
  const [editing, setEditing] = useState(null);
  const canEdit = useAccess().canEdit('orders');
  const r = useReviews();
  return (
    <section className="bk-section" aria-labelledby="bk-reviews">
      <div className="bk-section__head">
        <h2 id="bk-reviews" className="bk-section__title">
          Reviews
        </h2>
        <div className="feat-toolbar feat-toolbar--bare">
        <Field hideLabel label="Pooja" type="select" className="ui-field--auto" value={r.pooja} options={[{ value: '', label: 'Pooja: All' }, ...r.poojas.map((p) => ({ value: p, label: p }))]} onChange={r.setPooja} />
        <Field hideLabel label="Visibility" type="select" className="ui-field--auto" value={r.hidden} options={VISIBILITY} onChange={r.setHidden} />
        </div>
      </div>
      <Card flush>
      <ListStates list={r} emptyTitle="No reviews" emptyBody="Reviews appear here once a devotee reviews a performed pooja.">
        <DataTable label="Reviews" minWidth={820}>
          <thead>
            <tr>
              <th>Devotee</th>
              <th>Pooja</th>
              <th>Rating</th>
              <th>Review</th>
              <th>
                <span className="ui-sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((v) => (
              <tr key={idOf(v)} className={v.hidden ? 'bk-row--hidden' : ''}>
                <td>{accountOf(v)}</td>
                <td>
                  {v.poojaTitle}
                  <span className="sub">{v.bookingRef}</span>
                </td>
                <td>
                  <span className="bk-stars" role="img" aria-label={`${v.rating} out of 5`}>
                    {stars(v.rating)}
                  </span>
                </td>
                <td className="bk-review">
                  {v.hidden && <Badge tone="warning">Hidden</Badge>} {v.edited && <Badge tone="neutral">Edited</Badge>} {v.text || <span className="sub">No comment</span>}
                </td>
                <td className="actions">
                  {canEdit && (
                    <div className="ui-actions">
                      <Button variant="outline" size="sm" aria-label={`Edit review ${v.bookingRef}`} onClick={() => setEditing(v)}>
                        Edit
                      </Button>
                      <Button variant={v.hidden ? 'primary' : 'outline'} size="sm" loading={r.busy === idOf(v)} aria-label={`${v.hidden ? 'Show' : 'Hide'} review ${v.bookingRef}`} onClick={() => r.setReviewHidden(v, !v.hidden)}>
                        {v.hidden ? 'Show' : 'Hide'}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </ListStates>
      </Card>
      {editing && (
        <EditReviewModal
          review={editing}
          saving={r.busy === idOf(editing)}
          onClose={() => setEditing(null)}
          onSave={async (text) => {
            if (await r.saveReviewText(editing, text)) setEditing(null);
          }}
        />
      )}
      <p className="feat-note feat-note--bare">Reviews can be hidden, shown or reworded. The rating and the name cannot be changed, and only a devotee with a performed booking can write one.</p>
    </section>
  );
}
