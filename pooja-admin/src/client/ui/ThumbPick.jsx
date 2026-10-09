import { useRef } from 'react';

import { Button } from './Button.jsx';

/**
 * A compact image picker for table rows and galleries: a thumbnail (or a
 * placeholder) and an Upload/Replace button. The native input is hidden and
 * driven by the button, so it stays keyboard-operable. `src` is the resolved
 * URL to show; the caller owns upload and storage.
 *
 * @typedef {Object} ThumbPickProps
 * @property {string} label            accessible name ("Package 2 image")
 * @property {string} [src]            resolved image URL
 * @property {(file: File) => void} onFile
 * @property {boolean} [uploading]
 * @property {(() => void)} [onClear]  shows a Remove button when there is an image
 */
export function ThumbPick({ label, src, onFile, uploading = false, onClear }) {
  const fileRef = useRef(null);
  return (
    <div className="ui-thumbpick">
      {src ? <img className="ui-thumb ui-thumb--lg" src={src} alt="" /> : <span className="ui-thumb ui-thumb--lg ui-thumb--ph" aria-hidden="true">+</span>}
      <Button variant="outline" size="sm" loading={uploading} aria-label={`${src ? 'Replace' : 'Upload'} ${label}`} onClick={() => fileRef.current?.click()}>
        {src ? 'Replace' : 'Upload'}
      </Button>
      {src && onClear && (
        <Button variant="danger" size="sm" aria-label={`Remove ${label}`} onClick={onClear}>
          Remove
        </Button>
      )}
      <input
        ref={fileRef}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        className="ui-filefield__input"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </div>
  );
}
