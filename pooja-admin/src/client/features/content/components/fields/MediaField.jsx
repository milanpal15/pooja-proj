import { api } from '../../../../lib/api/index.js';
import { FileField } from '../../../../ui/index.js';

/** Image or audio: a URL box, an Upload button, and (for images) a preview. */
export function MediaField({ field, value, onChange, uploading, onFile }) {
  return (
    <FileField
      label={field.label}
      value={value}
      placeholder="paste URL or upload →"
      accept={field.type === 'image' ? 'image/*' : 'audio/*'}
      uploading={uploading}
      onChange={onChange}
      onFile={onFile}
      preview={field.type === 'image' && value ? <img className="ui-thumb" src={api.asset(value)} alt="" /> : null}
    />
  );
}
