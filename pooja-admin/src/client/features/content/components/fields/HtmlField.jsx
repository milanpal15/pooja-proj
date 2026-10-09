import { Field } from '../../../../ui/index.js';

const MAX_BYTES = 20 * 1024;

/** Markup in a monospace box. The server cleans it on save and limits it to 20 KB. */
export function HtmlField({ field, value, onChange }) {
  const bytes = new Blob([value || '']).size;
  return (
    <Field
      type="textarea"
      rows={8}
      label={field.label}
      value={value}
      onChange={onChange}
      spellCheck={false}
      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.6 }}
      error={bytes > MAX_BYTES ? `${Math.round(bytes / 1024)} KB — the limit is 20 KB` : undefined}
      hint={field.hint}
    />
  );
}
