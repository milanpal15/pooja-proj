import { useRef } from 'react';

import { api } from '../../../../lib/api/index.js';
import { useUpload } from '../../../../lib/hooks/useUpload.js';
import { Button } from '../../../../ui/index.js';

/** One image: preview, upload/replace, remove. `hint` says the size. */
export function CoverField({ value, onChange, label = 'Cover image', hint, disabled }) {
  const ref = useRef(null);
  const { busy, upload } = useUpload();
  return (
    <div className="hs-upload">
      {value && <span className="lv-cover" style={{ backgroundImage: `url("${api.asset(value)}")` }} role="img" aria-label={label} />}
      {!disabled && (
        <>
          <Button variant="outline" loading={busy === 'img'} onClick={() => ref.current?.click()}>{value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}</Button>
          {value && <Button variant="outline" onClick={() => onChange('')}>Remove</Button>}
        </>
      )}
      {hint && <span className="hs-upload__hint">{hint}</span>}
      <input ref={ref} type="file" tabIndex={-1} aria-hidden="true" className="ui-filefield__input" accept="image/jpeg,image/png"
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { const url = await upload(f, 'img'); if (url) onChange(url); } }} />
    </div>
  );
}
