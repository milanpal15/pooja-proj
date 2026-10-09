import { isLiveNow } from '../lib/schedule.js';
import { isFixed, nameOf, sourceOf } from '../lib/sources.js';

/** "Order on the phone": one bar per block that would show right now (off or out-of-schedule drop out). */
export function PhonePreview({ sections }) {
  const shown = sections.filter((s) => isFixed(s) || isLiveNow(s));
  return (
    <aside className="hl-phone" aria-label="Order on the phone">
      <h2 className="hl-phone__title">Order on the phone</h2>
      <ol className="hl-phone__bars">
        {shown.map((s) => (
          <li key={s.key} className={`hl-phone__bar hl-tone-${s.tone || sourceOf(s).tone}`} title={nameOf(s)}>
            <span className="ui-sr-only">{nameOf(s)}</span>
          </li>
        ))}
      </ol>
      <p className="hl-phone__note">Off or out-of-schedule blocks drop out of the list. The phone falls back to this same order, bundled, when offline.</p>
    </aside>
  );
}
