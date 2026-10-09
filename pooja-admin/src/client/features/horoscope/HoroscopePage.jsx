import { useState } from 'react';

import { ContentManager } from '../content/index.js';
import { useAccess } from '../../lib/access/index.js';
import { api } from '../../lib/api/index.js';
import { Card, ErrorState, Switch } from '../../ui/index.js';
import { DayBar } from './components/DayBar.jsx';
import { DaySummary } from './components/DaySummary.jsx';
import { RashiGrid } from './components/RashiGrid.jsx';
import { WeekStrip } from './components/WeekStrip.jsx';
import { ReadingViewModal } from './components/ReadingViewModal.jsx';
import { ReadingModal } from './components/ReadingModal/index.js';
import { HOROSCOPE_FIELDS } from './constants/fields.js';
import { useCopyPreviousDay } from './hooks/useCopyPreviousDay.jsx';
import { useDayScope } from './hooks/useDayScope.js';
import { useHoroscope } from './hooks/useHoroscope.js';
import { useReadingEditor } from './hooks/useReadingEditor.js';
import { dayCards, weekAround } from './lib/status.js';

/**
 * The Horoscope tab: one day at a time, twelve rashi cards.
 *
 * Horoscopes are twelve rows a day and most days rework the last, so the page
 * answers "what is still unwritten today?" before anything else: a week strip
 * with a fill count per day, a progress bar, and a card per rashi that is
 * either a reading or an invitation to write one.
 *
 * Every reading is written through the modal here — the one place a reading is
 * edited. "Show all dates" falls back to the plain table for bulk review.
 */
export function HoroscopePage({ area = 'horoscope' }) {
  const { date, allDates, setDate, setAllDates } = useDayScope();

  if (allDates) return <AllDates date={date} area={area} onAllDates={setAllDates} />;
  return <DayView date={date} area={area} onDateChange={setDate} onAllDates={setAllDates} />;
}

function DayView({ date, area, onDateChange, onAllDates }) {
  const readOnly = !useAccess().canEdit(area);
  const [msg, setMsg] = useState('');
  const { rows, err, reload, byDate } = useHoroscope();
  const { cards, counts, written } = dayCards(byDate, date);
  const editor = useReadingEditor({ date, reload, setMsg });
  const { copy, copying } = useCopyPreviousDay({ date, written, reload, setMsg });

  if (err) return <ErrorState message={err} onRetry={reload} />;

  return (
    <div className="ui-page">
      <Card className="horo-day">
        <DayBar date={date} allDates={false} readOnly={readOnly} onDateChange={onDateChange} onAllDates={onAllDates} copying={copying} onCopy={copy} />
        <WeekStrip week={weekAround(byDate, date)} onSelectDay={onDateChange} />
        <DaySummary written={written} counts={counts} msg={msg} />
      </Card>

      <RashiGrid
        cards={cards}
        loading={rows === null}
        readOnly={readOnly}
        busyRow={editor.busyRow}
        onEdit={editor.open}
        onToggleVisible={editor.toggleVisible}
      />

      {editor.editing && readOnly && <ReadingViewModal reading={editor.editing} onClose={editor.close} />}
      {editor.editing && !readOnly && (
        <ReadingModal
          editing={editor.editing}
          saving={editor.saving}
          onChange={editor.set}
          onSave={editor.save}
          onDelete={editor.remove}
          onClose={editor.close}
        />
      )}
    </div>
  );
}

// A new reading starts on the day being edited, not blindly on today.
function AllDates({ date, area, onAllDates }) {
  const fields = HOROSCOPE_FIELDS.map((f) => (f.key === 'date' ? { ...f, default: () => date } : f));
  return (
    <div className="ui-page">
      <div>
        <Switch variant="card" label="Show all dates" checked onChange={onAllDates} />
      </div>
      <ContentManager title="Reading" resource={api.horoscopes} fields={fields} previewKey="rashi" scopeNote="all dates" area={area} />
    </div>
  );
}
