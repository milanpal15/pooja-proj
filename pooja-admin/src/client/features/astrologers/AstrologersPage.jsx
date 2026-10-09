import { useMemo, useState } from 'react';

import { useAccess } from '../../lib/access/index.js';
import { Banner, Button, useToast } from '../../ui/index.js';
import { AstrologerModal } from './components/AstrologerModal/index.js';
import { AstrologerViewModal } from './components/AstrologerViewModal.jsx';
import { AstrologerTable } from './components/AstrologerTable.jsx';
import { LiveStrip } from './components/LiveStrip.jsx';
import { useAstrologers } from './hooks/useAstrologers.js';
import { filterRows } from './lib/form.js';

/** Astrologers: who is on the platform, who is online, and their terms. */
export function AstrologersPage({ area = 'astrologers' }) {
  const readOnly = !useAccess().canEdit(area);
  const { data, status, error, offline, actions } = useAstrologers();
  const [filters, setFilters] = useState({ q: '', status: '', speciality: '' });
  // `false` closed, `null` adding, an astrologer = editing.
  const [editing, setEditing] = useState(false);
  const toast = useToast();

  const visible = useMemo(() => filterRows(data.rows, filters), [data.rows, filters]);
  const specialities = useMemo(() => [...new Set(data.rows.flatMap((a) => a.specialities || []))].sort(), [data.rows]);

  const listed = (a, v) => actions.setListed(a, v).catch((e) => toast.error(`Could not change ${a.name}. ${e.message}`));

  return (
    <div className="ui-page">
      <div className="feat-toolbar" style={{ border: 0, padding: 0, justifyContent: 'space-between' }}>
        <p className="content-lede" style={{ margin: 0, flex: '1 1 420px' }}>
          {readOnly
            ? 'Who is on the platform, who is online, and their terms.'
            : 'Add an astrologer here with their sign-in email or mobile. They log in to the app the normal way and land straight in the astrologer view, with no profile form. Changes apply to the next call.'}
        </p>
        {!readOnly && <Button onClick={() => setEditing(null)}>+ Add astrologer</Button>}
      </div>

      {status === 'stale' && (
        <Banner action={<Button size="sm" variant="secondary" onClick={actions.reload}>Refresh</Button>}>
          Couldn't refresh. Presence may be out of date.
        </Banner>
      )}

      <LiveStrip counts={data.counts} loading={status === 'loading'} />

      <AstrologerTable
        rows={visible}
        total={data.rows.length}
        status={status}
        error={error}
        offline={offline}
        filters={filters}
        onFilters={setFilters}
        specialities={specialities}
        readOnly={readOnly}
        onAdd={() => setEditing(null)}
        onEdit={setEditing}
        onListed={listed}
        onRetry={actions.reload}
      />

      {editing && readOnly && <AstrologerViewModal astrologer={editing} onClose={() => setEditing(false)} />}
      {editing !== false && !readOnly && (
        <AstrologerModal
          astrologer={editing}
          defaultSharePct={data.defaultSharePct}
          onSave={actions.save}
          onRemove={actions.remove}
          onSuspend={actions.suspend}
          onReactivate={actions.reactivate}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
