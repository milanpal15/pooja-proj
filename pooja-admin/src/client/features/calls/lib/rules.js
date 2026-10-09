/**
 * Billing rules as a form. Money in `payoutPaisePerCoin` is paise on the wire and
 * rupees on screen ("₹ per coin"); everything else is shown as stored.
 */
export const CALL_RULES = [
  { key: 'minMinutes', label: 'Minimum minutes to start', min: 1, hint: 'A devotee needs this many minutes of balance to call.' },
  { key: 'ringTimeoutSec', label: 'Ring timeout (seconds)', min: 5, hint: 'How long the astrologer has to answer.' },
  { key: 'defaultSharePct', label: 'Default platform share (%)', min: 0, max: 100, hint: 'Pre-filled for new astrologers.' },
  { key: 'payoutPaisePerCoin', label: 'Payout value per coin (₹)', min: 0, decimal: true, rupees: true, hint: 'What one coin is worth when paying an astrologer.' },
];

export const OTHER_RULES = [
  { key: 'coinsPerRupee', label: 'Coins per ₹1', min: 0.01, decimal: true, hint: 'The normal rate. Sale % on packs is measured against it.' },
  { key: 'chadhavaServiceFee', label: 'Chadhava service fee (coins)', min: 0, hint: 'Added to every chadhava offering.' },
  { key: 'chadhavaMinAmount', label: 'Smallest chadhava amount (coins)', min: 0 },
  { key: 'bookingCancelHours', label: 'Booking refund cut-off (hours)', min: 0, hint: 'Hours before the seva day. 0 means until the seva date.' },
  { key: 'prasadDelivery', label: 'Prasad delivery (coins)', min: 0, hint: 'Courier fee added when a devotee asks for prasad.' },
];

const ALL = [...CALL_RULES, ...OTHER_RULES];

const shown = (f, v) => (f.rupees ? String((Number(v) || 0) / 100) : String(v ?? ''));

export const rulesToForm = (rules) => ({
  ...Object.fromEntries(ALL.map((f) => [f.key, shown(f, rules?.[f.key])])),
  callsEnabled: rules?.callsEnabled !== false,
});

export function validateRules(form) {
  const errors = {};
  for (const f of ALL) {
    const raw = String(form[f.key]).trim();
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) errors[f.key] = 'Enter a number.';
    else if (!f.decimal && !Number.isInteger(n)) errors[f.key] = 'A whole number.';
    else if (n < f.min) errors[f.key] = `At least ${f.min}.`;
    else if (f.max !== undefined && n > f.max) errors[f.key] = `At most ${f.max}.`;
  }
  return errors;
}

export function rulesToBody(form) {
  return {
    ...Object.fromEntries(ALL.map((f) => [f.key, f.rupees ? Math.round(Number(form[f.key]) * 100) : Number(form[f.key])])),
    callsEnabled: !!form.callsEnabled,
  };
}
