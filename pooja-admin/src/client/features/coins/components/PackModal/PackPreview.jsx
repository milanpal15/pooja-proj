import { formatCoins, formatRupees } from '../../../../lib/money.js';
import { saleLabel } from '../../lib/packs.js';

/** The pack as the app draws it (sale tag only when it would show). */
export function PackPreview({ derived }) {
  const d = derived;
  const label = saleLabel(d);
  return (
    <div>
      <div className="ui-field__label" style={{ marginBottom: 8 }}>
        How it looks in the app
      </div>
      <div className="coin-preview-wrap">
        <div className="coin-card" aria-label="Pack preview">
          {label && <span className="coin-card__tag">{label}</span>}
          <span className="coin-card__coins">
            <span className="coin-card__dot" aria-hidden="true" />
            {d.valid ? formatCoins(d.coins) : '—'}
          </span>
          <span className="coin-card__sub">{d.valid && d.extraCoins > 0 ? `${d.baseCoins} + ${d.extraCoins} extra` : ' '}</span>
          <span className="coin-card__price">{d.valid ? formatRupees(d.price) : '—'}</span>
        </div>
      </div>
    </div>
  );
}
