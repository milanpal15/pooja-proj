import { Field, Switch } from '../../../../ui/index.js';

/** The reading's fields: EN/HI pair, lucky row, visibility. */
export function ReadingForm({ editing, onChange }) {
  return (
    <>
      <div className="feat-grid2 horo-pair">
        <Field
          type="textarea"
          rows={7}
          label="Reading · English"
          value={editing.prediction}
          hint={`${(editing.prediction || '').length} characters`}
          onChange={(v) => onChange('prediction', v)}
        />
        <Field
          type="textarea"
          rows={7}
          label="Reading · हिन्दी"
          placeholder="हिन्दी में फल लिखें"
          value={editing.predictionHi}
          hint={editing.predictionHi ? `${editing.predictionHi.length} characters` : 'Empty · the app falls back to English'}
          onChange={(v) => onChange('predictionHi', v)}
        />
      </div>

      <div className="feat-grid3">
        <Field label="Lucky colour · EN" value={editing.luckyColor} onChange={(v) => onChange('luckyColor', v)} />
        <Field label="Lucky colour · HI" value={editing.luckyColorHi} onChange={(v) => onChange('luckyColorHi', v)} />
        <Field label="Lucky number" value={editing.luckyNumber} onChange={(v) => onChange('luckyNumber', v)} />
      </div>

      <Switch
        variant="card"
        label="Visible in the app"
        hint="Switch off to keep this as a draft; the app shows “not published yet”."
        checked={!!editing.enabled}
        onChange={(v) => onChange('enabled', v)}
      />
    </>
  );
}
