import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { formatWhen } from '../../../lib/dates.js';
import { Badge, Banner, Button, Modal, TableSkeleton, useToast } from '../../../ui/index.js';
import { compare, summary } from '../lib/diff.js';
import { exportName, format } from '../lib/json.js';

/**
 * Published versions, newest first. "View JSON" loads the stored document and
 * compares it with the current draft by block id; "Roll back to draft" copies
 * that version into the DRAFT (it does not publish).
 */
export function HistoryModal({ meta, draft, canEdit, unsaved, busy, onRollback, onClose }) {
  const toast = useToast();
  const [view, setView] = useState(null); // { version, status, doc, error }
  const live = meta.published?.version;
  const rows = [...(meta.published ? [meta.published] : []), ...meta.history.filter((h) => h.version !== live)];

  const open = async (v) => {
    setView({ version: v, status: 'loading' });
    try {
      const doc = await api.homeLayout.version(v);
      setView({ version: v, status: 'ready', doc: doc?.blocks ? doc : doc?.document || doc });
    } catch (e) {
      setView({ version: v, status: 'error', error: e.message });
    }
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.success('Copied'); } catch { toast.error('Could not copy. Select the text and copy it.'); }
  };
  const download = (text, v) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = exportName(`v${v}`);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (view) {
    const text = view.doc ? format(view.doc) : '';
    const diff = view.doc ? compare(draft, view.doc) : null;
    return (
      <Modal open onClose={onClose} title={`Version ${view.version}`} subtitle={diff ? `Compared with your draft: ${summary(diff)} (${diff.before} → ${diff.after} blocks)` : ''} size="md"
        footer={<><Button variant="secondary" onClick={() => setView(null)}>Back to history</Button>{view.doc && <><Button variant="outline" onClick={() => copy(text)}>Copy</Button><Button variant="outline" onClick={() => download(text, view.version)}>Export</Button></>}</>}>
        {view.status === 'loading' && <TableSkeleton rows={6} />}
        {view.status === 'error' && <Banner tone="error">Could not load that version. {view.error}</Banner>}
        {view.doc && <textarea className="ui-input hl2-json hl2-json--ro" readOnly rows={18} aria-label={`Version ${view.version} JSON`} value={text} />}
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} title="History" subtitle="Published versions, newest first. The last 20 are listed." size="md" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {rows.length === 0 && <p className="ui-field__hint">Nothing has been published yet.</p>}
      <ul className="hl2-history">
        {rows.map((h) => (
          <li key={h.version} className="hl2-history__row">
            <div className="hl2-history__text">
              <span className="hl2-history__title"><b>Version {h.version}</b>{h.version === live && <Badge tone="success">Live</Badge>}</span>
              <span>{h.publishedAt ? formatWhen(h.publishedAt) : ''}{h.publishedBy ? ` · ${h.publishedBy}` : ''} · {h.blockCount ?? '?'} blocks</span>
              {h.note && <em>“{h.note}”</em>}
            </div>
            <div className="hl2-history__actions">
              <Button variant="outline" size="sm" onClick={() => open(h.version)}>View JSON</Button>
              {canEdit && <Button variant="secondary" size="sm" loading={busy === 'rollback'} disabled={!!busy} onClick={() => onRollback(h.version, unsaved)}>Roll back to draft</Button>}
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
