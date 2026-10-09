import { useRef } from 'react';

import { api } from '../../../../lib/api/index.js';
import { useUpload } from '../../../../lib/hooks/useUpload.js';
import { Button, IconButton } from '../../../../ui/index.js';

/** Gallery images in order — the first is the list banner. Upload several at once. */
export function GallerySection({ gallery, onChange }) {
  const { busy, upload } = useUpload();
  const fileRef = useRef(null);

  const addFiles = async (files) => {
    let next = gallery;
    for (const f of files) {
      const url = await upload(f, 'gallery');
      if (url) {
        next = [...next, url];
        onChange(next);
      }
    }
  };
  const move = (i, d) => {
    const next = gallery.slice();
    next.splice(i + d, 0, next.splice(i, 1)[0]);
    onChange(next);
  };

  return (
    <div className="pj-gallery">
      {gallery.length > 0 && (
        <ul className="pj-gallery__list" aria-label="Gallery images">
          {gallery.map((url, i) => (
            <li key={url} className="pj-gallery__item">
              <img src={api.asset(url)} alt={`Gallery image ${i + 1}`} />
              {i === 0 && <span className="pj-gallery__first">Banner</span>}
              <span className="pj-gallery__tools">
                <IconButton label={`Move image ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ←
                </IconButton>
                <IconButton label={`Move image ${i + 1} later`} disabled={i === gallery.length - 1} onClick={() => move(i, 1)}>
                  →
                </IconButton>
                <IconButton label={`Remove image ${i + 1}`} onClick={() => onChange(gallery.filter((_, j) => j !== i))}>
                  ×
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button variant="outline" loading={busy === 'gallery'} onClick={() => fileRef.current?.click()}>
          Upload images
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          className="ui-filefield__input"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const files = [...e.target.files];
            e.target.value = '';
            addFiles(files);
          }}
        />
        <p className="ui-field__hint">JPG, PNG or WebP. The first image is the list banner.</p>
      </div>
    </div>
  );
}
