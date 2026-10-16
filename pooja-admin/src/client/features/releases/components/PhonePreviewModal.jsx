import { useState } from 'react';

import { Button, Modal, Segmented } from '../../../ui/index.js';
import { previewCards } from '../lib/phone.js';

/** A schematic phone screen: what one of the five policy outcomes looks like to a devotee. */
export function PhoneCard({ card }) {
  return (
    <figure className="phone">
      <div className={`phone__screen phone__screen--${card.key}`} aria-label={`${card.title} screen`}>
        <div className="phone__status" aria-hidden="true"><span>9:41</span><span>▮▮▮</span></div>
        <div className="phone__body">
          <div className="phone__om" aria-hidden="true">ॐ</div>
          <h3 className="phone__title">{card.title}</h3>
          <p className="phone__msg">{card.message}</p>
          <div className="phone__btns">
            {card.buttons.map((b, i) => (
              <span key={b} className={`phone__btn ${i === 0 ? 'phone__btn--main' : ''}`}>{b}</span>
            ))}
          </div>
        </div>
      </div>
      <figcaption>
        <b>{card.title}</b>
        <span>{card.dismissible ? 'Can be dismissed. ' : ''}{card.note}</span>
        {card.usingDefault && <span className="muted">No message set, so the app shows its own wording.</span>}
      </figcaption>
    </figure>
  );
}

export function PhonePreviewModal({ form, onClose }) {
  const [lang, setLang] = useState('en');
  const cards = previewCards(form, lang);
  return (
    <Modal open onClose={onClose} size="xl" title="Preview on phone" subtitle="Your wording as devotees will read it. Titles and buttons are the app’s own."
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div style={{ marginBottom: 16 }}>
        <Segmented label="Preview language" value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]} />
      </div>
      <div className="phones">
        {cards.map((c) => <PhoneCard key={c.key} card={c} />)}
      </div>
    </Modal>
  );
}
