import { Badge, Button } from '../../../ui/index.js';
import { PILL, statusOf } from '../lib/status.js';
import { LanguageTags } from './LanguageTags.jsx';

const TONE = { pub: 'success', hidden: 'warning', empty: 'outline' };

/** One rashi for the day: either a reading or an invitation to write one. */
export function RashiCard({ card, busy, readOnly = false, onEdit, onToggleVisible }) {
  const st = statusOf(card.row);
  const r = card.row;
  return (
    <article className={`horo-card ${st}`}>
      <header>
        <div>
          <div className="hi">{card.hi}</div>
          <div className="en">
            {card.name} · {card.en}
          </div>
        </div>
        <Badge tone={TONE[st]}>{PILL[st]}</Badge>
      </header>
      {st === 'empty' ? (
        <p className="horo-none">Nothing written for this day yet.</p>
      ) : (
        <>
          <p className="horo-text">{r.prediction || r.predictionHi}</p>
          <div className="horo-meta">
            {r.luckyColor && <span>{r.luckyColor}</span>}
            {r.luckyNumber && <span>Lucky {r.luckyNumber}</span>}
            <LanguageTags row={r} />
          </div>
        </>
      )}
      {readOnly ? (
        st !== 'empty' && (
          <footer>
            <Button variant="outline" aria-label={`View ${card.name}`} onClick={() => onEdit(card)}>
              View
            </Button>
          </footer>
        )
      ) : (
        <footer>
          <Button variant={st === 'empty' ? 'primary' : 'outline'} aria-label={`${st === 'empty' ? 'Write reading' : 'Edit'} ${card.name}`} onClick={() => onEdit(card)}>
            {st === 'empty' ? 'Write reading' : 'Edit'}
          </Button>
          {st !== 'empty' && (
            <Button variant="ghost" disabled={busy} aria-label={`${r.enabled ? 'Hide' : 'Publish'} ${card.name}`} onClick={() => onToggleVisible(r)}>
              {r.enabled ? 'Hide' : 'Publish'}
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}
