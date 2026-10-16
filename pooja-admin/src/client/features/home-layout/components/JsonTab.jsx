import { useRef, useState } from 'react';

import { Badge, Banner, Button, useToast } from '../../../ui/index.js';
import { describeEntry } from '../lib/errors.js';
import { exportName, format, parseDocument, peek } from '../lib/json.js';
import { toBody } from '../lib/layout.js';

/**
 * The whole `{schemaVersion, layouts}` set as text (an older single-layout paste is wrapped as the default layout). What is typed here is
 * only a draft of the text until "Apply to builder": nothing reaches the
 * layout (or the server) by accident. Import is lenient (missing fields are
 * filled, ids made, unknown fields dropped, all reported); the server has the
 * last word through "Check with server", which lists errors by block and field.
 */
export function JsonTab({ doc, reg, text, onText, canEdit, busy, onApply, onValidate }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [result, setResult] = useState(null); // { kind:'ok'|'bad'|'note', ... } from the last check / apply
  const canonical = format(toBody(doc, reg)); // exactly what Save would send
  const shown = text ?? canonical;
  const edited = text !== null && text !== canonical;
  const read = peek(shown);

  const type = (v) => { setResult(null); onText(v); };
  const parsed = () => {
    const p = parseDocument(shown);
    if (p.error) setResult({ kind: 'parse', message: p.error });
    return p;
  };

  const doFormat = () => {
    const p = parsed();
    if (p.doc) {
      // Format keeps what was typed (unlike Apply): only the layout of the text changes.
      try { onText(JSON.stringify(JSON.parse(shown), null, 2)); setResult(null); } catch { /* reported by parsed() */ }
    }
  };
  const doApply = () => {
    const p = parsed();
    if (!p.doc) return;
    onApply(p.doc);
    onText(null);
    setResult({ kind: 'note', notes: p.notes, applied: true });
    toast.success('Applied to the builder. Save the draft to keep it.');
  };
  const doCheck = async () => {
    const p = parsed();
    if (!p.doc) return;
    const r = await onValidate(p.doc); // the text as written (not cleaned), so unknown fields are reported too
    if (r.failed) setResult({ kind: 'parse', message: `Could not check. ${r.message}` });
    else setResult(r.ok ? { kind: 'ok', notes: p.notes } : { kind: 'bad', entries: r.entries, global: r.global, doc: p.doc, notes: p.notes });
  };
  const doImport = async (file) => {
    try {
      const body = await file.text();
      onText(body);
      const p = parseDocument(body);
      setResult(p.error ? { kind: 'parse', message: p.error } : { kind: 'note', notes: p.notes, imported: file.name });
    } catch {
      setResult({ kind: 'parse', message: 'Could not read that file.' });
    }
  };
  const doExport = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([shown], { type: 'application/json' }));
    a.download = exportName('draft');
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Draft downloaded as a JSON file');
  };
  const doCopy = async () => {
    try { await navigator.clipboard.writeText(shown); toast.success('Copied'); } catch { toast.error('Could not copy. Select the text and copy it.'); }
  };

  return (
    <div className="hl2-jsonpane">
      <div className="hl2-jsonbar">
        <Button variant="outline" size="sm" onClick={doFormat} disabled={!read.ok || !canEdit}>Format</Button>
        {canEdit && <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Import file</Button>}
        <Button variant="outline" size="sm" onClick={doExport}>Export</Button>
        <Button variant="outline" size="sm" onClick={doCopy}>Copy</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" tabIndex={-1} aria-hidden="true" className="ui-filefield__input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) doImport(f); }} />
        <span className="hl2-bar__spacer" />
        {read.ok ? <Badge tone="success">{read.layouts} {read.layouts === 1 ? 'layout' : 'layouts'}, {read.blocks} sections</Badge> : <Badge tone="danger">Invalid JSON</Badge>}
        {edited && <Badge tone="warning">Not applied</Badge>}
        {canEdit && (
          <>
            <Button variant="outline" size="sm" loading={busy === 'validate'} disabled={!read.ok || !!busy} onClick={doCheck}>Check with server</Button>
            {edited && <Button variant="secondary" size="sm" onClick={() => { onText(null); setResult(null); }}>Revert text</Button>}
            <Button size="sm" disabled={!read.ok || !edited} onClick={doApply}>Apply to builder</Button>
          </>
        )}
      </div>
      {!read.ok && <p className="ui-field__error" role="alert">{read.error}</p>}
      <textarea className="ui-input hl2-json" spellCheck={false} rows={26} aria-label="Home layout JSON (all layouts)" readOnly={!canEdit} value={shown} onChange={(e) => type(e.target.value)} />
      {result?.kind === 'parse' && <Banner tone="error">{result.message}</Banner>}
      {result?.kind === 'ok' && <Banner tone="success">The server accepts this layout. Apply it, save the draft, then publish.</Banner>}
      {result?.kind === 'bad' && (
        <Banner tone="error">
          The server refused it: {result.entries.length + result.global.length} {result.entries.length + result.global.length === 1 ? 'problem' : 'problems'}.
          <ul className="hl2-errors">
            {result.global.map((g) => <li key={g.path}><b>{g.path.replace(/\./g, ' › ')}</b>: {g.message}</li>)}
            {result.entries.map((e) => <li key={e.path}><b>{describeEntry(e, result.doc, reg)}</b>: {e.message}</li>)}
          </ul>
        </Banner>
      )}
      {result?.notes?.length > 0 && (
        <Banner tone="warning">
          {result.imported ? `Imported ${result.imported}. ` : ''}Adjusted while reading:
          <ul className="hl2-errors">{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </Banner>
      )}
    </div>
  );
}
