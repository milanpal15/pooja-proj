import { useCallback, useEffect, useState } from 'react';

import { api } from './api.js';

/**
 * Rules & Regulations editor.
 *
 * Markdown in, Markdown out — the app renders it, so the dashboard shows a
 * preview rather than a WYSIWYG that would lie about the result.
 *
 * Save and Publish are deliberately separate buttons. Saving fixes a typo
 * silently; publishing bumps the version, which invalidates every prior
 * acceptance and makes every devotee read and accept again on next launch.
 * One of those should not be a side effect of the other.
 */
export function Policies() {
  const [doc, setDoc] = useState(null);
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.policy('terms');
      setDoc(d);
      setBody(d.bodyMd || '');
      setTitle(d.title || '');
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (publish) => {
    if (publish) {
      const ok = confirm(
        'Publishing bumps the version to ' +
          ((doc?.version ?? 0) + 1) +
          '.\n\nEvery devotee will be asked to read and accept the rules again on their next launch. Continue?',
      );
      if (!ok) return;
    }
    setBusy(publish ? 'publish' : 'save');
    setNote('');
    try {
      const updated = await api.savePolicy('terms', { title, bodyMd: body }, publish);
      setDoc(updated);
      setNote(publish ? `Published as v${updated.version}` : 'Saved (version unchanged)');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  if (err) return <div className="error">Can&apos;t reach API. {err}</div>;
  if (!doc) return <p className="muted">Loading…</p>;

  const dirty = body !== (doc.bodyMd || '') || title !== (doc.title || '');

  return (
    <div className="panel">
      <div className="cm-head">
        <div>
          <span className="muted">
            Version <b>{doc.version}</b>
            {doc.publishedAt && ` · published ${new Date(doc.publishedAt).toLocaleDateString()}`}
          </span>
          {dirty && <span className="pill failed" style={{ marginLeft: 10 }}>unsaved</span>}
          {note && <span className="pill success" style={{ marginLeft: 10 }}>{note}</span>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn ghost" disabled={!!busy || !dirty} onClick={() => save(false)}>
            {busy === 'save' ? 'Saving…' : 'Save draft'}
          </button>
          <button className="btn" disabled={!!busy} onClick={() => save(true)}>
            {busy === 'publish' ? 'Publishing…' : 'Publish new version'}
          </button>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="md-split">
        <div className="field">
          <label>Markdown</label>
          <textarea
            className="md-editor"
            value={body}
            spellCheck
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Preview — as the app renders it</label>
          <div className="md-preview" dangerouslySetInnerHTML={{ __html: renderMd(body) }} />
        </div>
      </div>

      <p className="muted" style={{ marginTop: 14 }}>
        Supported: headings, <b>bold</b>, <i>italic</i>, lists, links, quotes, rules and inline
        code. The app renders this same subset — anything outside it shows as plain text.
      </p>
    </div>
  );
}

/**
 * Preview renderer for the dashboard.
 *
 * Escapes first, then marks up — the input is trusted (an operator typed it)
 * but escaping costs nothing and stops a stray `<script>` in the rules from
 * running inside the admin panel.
 *
 * This mirrors the subset the app supports. Keep the two in step: anything
 * added here must be added in the app's renderer, or the preview lies.
 */
export function renderMd(md = '') {
  const esc = String(md)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const inline = (s) =>
    s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  const out = [];
  let list = null;

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of esc.split('\n')) {
    const line = raw.trimEnd();

    if (!line.trim()) { closeList(); continue; }

    // Lazy continuation: a wrapped line inside a list belongs to the item
    // above it, not to a new paragraph. Without this, every soft-wrapped
    // bullet split into a bullet plus an orphan paragraph.
    if (
      list &&
      !/^\s*([-*]|\d+\.)\s/.test(line) &&
      !/^(#{1,4}\s|&gt;|---|\*\*\*)/.test(line.trim())
    ) {
      const prev = out.pop();
      out.push(prev.replace(/<\/li>$/, ` ${inline(line.trim())}</li>`));
      continue;
    }
    if (/^(---|\*\*\*)$/.test(line.trim())) { closeList(); out.push('<hr>'); continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }

    if (/^&gt;\s?/.test(line)) {
      closeList();
      out.push(`<blockquote>${inline(line.replace(/^&gt;\s?/, ''))}</blockquote>`);
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('\n');
}
