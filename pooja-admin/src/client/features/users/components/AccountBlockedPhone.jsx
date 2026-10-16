import { useState } from 'react';

import { Segmented } from '../../../ui/index.js';
import { phoneModel } from '../lib/block.js';

/**
 * A schematic of the app's Account-blocked screen built from the form, so the operator reads what the person will
 * read: the message in English or Hindi, the end time in India time, and the two always-present buttons. The
 * title and buttons are the app's own. The support buttons the real screen adds come from Settings, so none are drawn.
 */
export function AccountBlockedPhone({ form, defaultLang = 'en' }) {
  const [lang, setLang] = useState(defaultLang);
  const m = phoneModel(form, lang);
  return (
    <figure className="phone usr-phone">
      <Segmented label="Preview language" value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]} />
      <div className="phone__screen phone__screen--blocked" aria-label="Account blocked screen">
        <div className="phone__status" aria-hidden="true">
          <span>9:41</span>
          <span>▮▮▮</span>
        </div>
        <div className="phone__body">
          <div className="phone__om" aria-hidden="true">ॐ</div>
          <h3 className="phone__title" lang={lang}>{m.title}</h3>
          <p className={`phone__msg usr-phone__msg ${m.usingDefault ? 'usr-phone__msg--default' : ''}`} lang={lang}>{m.message}</p>
          {m.until && <p className="usr-phone__until" lang={lang}>{m.until}</p>}
          <div className="phone__btns">
            {m.buttons.map((b, i) => (
              <span key={b} className={`phone__btn ${i === 0 ? 'phone__btn--main' : ''}`} lang={lang}>{b}</span>
            ))}
          </div>
        </div>
      </div>
      <figcaption>
        {m.usingDefault && <span className="muted">No message yet, so the app would show its own wording.</span>}
        {m.fellBack && <span className="muted">No Hindi message, so Hindi readers see the English one.</span>}
        {!m.usingDefault && !m.fellBack && <span className="muted">Shown full screen. The person can only try again or sign out.</span>}
      </figcaption>
    </figure>
  );
}
