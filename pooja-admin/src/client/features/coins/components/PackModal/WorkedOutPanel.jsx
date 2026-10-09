import { formatCoins } from '../../../../lib/money.js';
import { saleLabel } from '../../lib/packs.js';

/** "Worked out for you" — the figures that follow from coins and price. */
export function WorkedOutPanel({ derived, coinsPerRupee }) {
  const d = derived;
  const rate = coinsPerRupee === 1 ? '1 coin = ₹1' : `₹1 = ${coinsPerRupee} coins`;
  const label = saleLabel({ ...d, onSale: d.salePct >= 1 });
  let why;
  if (!d.valid) why = 'Enter the coins and the price to see the sale worked out.';
  else if (d.coins < d.baseCoins) why = 'Coins are fewer than the price buys at the normal rate. That is a premium, so it cannot be saved.';
  else if (d.extraCoins === 0) why = 'The coins equal what the price buys at the normal rate, so there is no sale to show.';
  else {
    const per = (d.price / d.coins).toFixed(2);
    why = `Sale % = extra coins ÷ coins at the normal rate = ${d.extraCoins} ÷ ${d.baseCoins}. Each coin effectively costs ₹${per} instead of ₹${(1 / coinsPerRupee).toFixed(2).replace(/\.00$/, '')} (${d.discountPct}% cheaper). If coins are fewer than the price, there is no sale and you will be warned before saving.`;
  }
  return (
    <section className="coin-worked" aria-label="Calculated sale">
      <div className="coin-worked__title">Worked out for you · {rate}</div>
      <div className="coin-worked__cells">
        <div>
          <div className="coin-worked__label">Coins at the normal rate</div>
          <div className="coin-worked__value">{d.valid ? formatCoins(d.baseCoins) : '—'}</div>
        </div>
        <div>
          <div className="coin-worked__label">Extra coins you give</div>
          <div className="coin-worked__value coin-worked__value--hot">{d.valid && d.extraCoins > 0 ? `+${formatCoins(d.extraCoins)}` : '—'}</div>
        </div>
        <div>
          <div className="coin-worked__label">Sale shown to devotees</div>
          <div className="coin-worked__value coin-worked__value--hot">{label || 'No sale'}</div>
        </div>
      </div>
      <p className="coin-worked__why" aria-live="polite">
        {why}
      </p>
    </section>
  );
}
