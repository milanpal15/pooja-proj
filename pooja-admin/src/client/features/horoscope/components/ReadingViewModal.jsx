import { ReadOnlyList, StatusText, ViewOnlyModal } from '../../../ui/index.js';
import { longDate } from '../../../lib/dates.js';
import { RASHIS } from '../constants/rashis.js';

/** A reading for an account that cannot edit: the text as text, one Close button. */
export function ReadingViewModal({ reading, onClose }) {
  const sign = RASHIS.find((s) => s.value === reading.rashi);
  return (
    <ViewOnlyModal title={`${sign?.name ?? reading.rashi} · ${sign?.en ?? ''}`} subtitle={longDate(reading.date)} onClose={onClose}>
      <ReadOnlyList
        label="Reading"
        rows={[
          { label: 'Reading · English', value: reading.prediction },
          { label: 'Reading · हिन्दी', value: reading.predictionHi },
          { label: 'Lucky colour · EN', value: reading.luckyColor },
          { label: 'Lucky colour · HI', value: reading.luckyColorHi },
          { label: 'Lucky number', value: reading.luckyNumber },
          { label: 'Visible in the app', value: <StatusText on={!!reading.enabled} onLabel="Published" offLabel="Draft, hidden" /> },
        ]}
      />
    </ViewOnlyModal>
  );
}
