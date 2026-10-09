import { Field, Switch } from '../../../../ui/index.js';
import { isoToLocalInput, localInputToIso } from '../../../../lib/dates.js';
import { TITHIS } from '../../lib/options.js';

const dt = (draft, set, key, label, hint) => (
  <Field type="datetime-local" label={label} hint={hint} value={isoToLocalInput(draft[key])} onChange={(v) => set(key, localInputToIso(v))} />
);

/** Titles, taglines, where and when, booking window, cancellation, prasad. */
export function BasicsSection({ draft, errors, refs, isNew, set, setTitle }) {
  return (
    <>
      <div className="feat-grid2 feat-grid--top">
        <Field label="Title (English)" value={draft.title} error={errors.title} onChange={setTitle} />
        <Field label="Title (Hindi)" value={draft.titleHi} onChange={(v) => set('titleHi', v)} />
      </div>
      <div className="feat-grid2 feat-grid--top">
        <Field label="Tagline (English)" value={draft.tagline} onChange={(v) => set('tagline', v)} />
        <Field label="Tagline (Hindi)" value={draft.taglineHi} onChange={(v) => set('taglineHi', v)} />
      </div>
      <Field
        label="Slug (the pooja’s address in the app)"
        value={draft.slug}
        error={errors.slug}
        readOnly={!isNew}
        hint={isNew ? undefined : 'Fixed once created, so links and bookings keep working'}
        onChange={(v) => set('slug', v)}
      />
      <div className="feat-grid2 feat-grid--top">
        <Field type="select" label="Temple" value={draft.templeSlug} options={refs.temples} onChange={(v) => set('templeSlug', v)} />
        <Field label="Place shown" value={draft.place} placeholder="Kashi Vishwanath, Varanasi" onChange={(v) => set('place', v)} />
      </div>
      <div className="feat-grid2 feat-grid--top">
        <Field type="select" label="Festival" value={draft.festivalSlug} options={refs.festivals} onChange={(v) => set('festivalSlug', v)} />
        <Field label="Tithi" list="pooja-tithis" value={draft.tithi} onChange={(v) => set('tithi', v)} />
        <datalist id="pooja-tithis">
          {TITHIS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
      <div className="feat-grid2 feat-grid--top">
        <Field type="date" label="Pooja date" value={draft.poojaDate} error={errors.poojaDate} hint="Leave empty for a pooja held every day" onChange={(v) => set('poojaDate', v)} />
        {dt(draft, set, 'bookingClosesAt', 'Bookings close', 'Empty = open until the pooja date passes')}
      </div>
      <div className="feat-grid2 feat-grid--top">
        <Field type="number" min="0" label="Cancel allowed until (hours before)" value={draft.cancelHours} error={errors.cancelHours} onChange={(v) => set('cancelHours', v)} />
        {dt(draft, set, 'publishAt', 'Opens for booking (optional)', 'A future time shows the pooja as Scheduled')}
      </div>
      <Field type="select" label="Deity (artwork fallback)" value={draft.deitySlug} options={refs.deities} onChange={(v) => set('deitySlug', v)} />
      <div className="feat-grid2 feat-grid--top">
        <Switch variant="card" label="Prasad delivery available" hint="Devotees may add it for a fee" checked={!!draft.prasadAvailable} onChange={(v) => set('prasadAvailable', v)} />
        {draft.prasadAvailable && <Field type="number" min="0" label="Prasad fee (coins)" value={draft.prasadFeeCoins} error={errors.prasadFeeCoins} onChange={(v) => set('prasadFeeCoins', v)} />}
      </div>
    </>
  );
}
