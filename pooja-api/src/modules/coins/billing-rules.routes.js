import { HttpError } from '../../lib/http-error.js';
import { ensureSetting, getBoolSetting, getNumberSetting } from '../../lib/settings.js';
import { Setting } from '../../models.js';

/**
 * The knobs an admin may turn without a deploy (contract §6).
 *
 * One table drives GET, PUT and validation, so a rule cannot be readable but
 * not writable, or validated differently from how it is read. PUT writes ONLY
 * the keys named here — this endpoint is not a generic settings writer.
 * `prasadDelivery` is a coin amount now, but keeps its original key and
 * (already seeded) row so existing deployments carry their value over.
 */
const RULES = {
  minMinutes: { kind: 'int', min: 1, max: 60, def: 3, label: 'Minutes needed to start a call', desc: 'Balance (in minutes of the astrologer’s rate) required to place a call.' },
  ringTimeoutSec: { kind: 'int', min: 5, max: 300, def: 25, label: 'Ring timeout (seconds)', desc: 'How long an astrologer has to answer.' },
  defaultSharePct: { kind: 'int', min: 0, max: 100, def: 30, label: 'Default platform share (%)', desc: 'Platform share for newly added astrologers.' },
  payoutPaisePerCoin: { kind: 'int', min: 0, max: 100_000, def: 100, label: 'Payout per coin (paise)', desc: 'Rupee value of one coin an astrologer earns.' },
  callsEnabled: { kind: 'bool', def: true, label: 'Calls enabled', desc: 'Kill switch for new calls.' },
  coinsPerRupee: { kind: 'num', min: 0.01, max: 10_000, def: 1, label: 'Coins per rupee', desc: 'Base value used to work out sale percentages.' },
  chadhavaServiceFee: { kind: 'int', min: 0, max: 100_000, def: 5, label: 'Chadhava service fee (coins)', desc: 'Added to every chadhava offering.' },
  chadhavaMinAmount: { kind: 'int', min: 1, max: 100_000, def: 1, label: 'Chadhava minimum amount (coins)', desc: 'Smallest offering amount.' },
  bookingCancelHours: { kind: 'int', min: 0, max: 24 * 365, def: 0, label: 'Booking refund cut-off (hours)', desc: 'Hours before the seva day after which a cancellation is not refunded. 0 = until the seva date.' },
  prasadDelivery: { kind: 'int', min: 0, max: 100_000, def: 99, label: 'Prasad delivery fee (coins)', desc: 'Added to a booking when prasad delivery is chosen.' },
};

export async function readRules() {
  const out = {};
  for (const [key, r] of Object.entries(RULES)) {
    out[key] = r.kind === 'bool' ? await getBoolSetting(key, r.def) : await getNumberSetting(key, r.def);
  }
  return out;
}

function check(key, v) {
  const r = RULES[key];
  const bad = (why) => new HttpError(400, 'bad_rule', `${r.label}: ${why}`, { field: key });
  if (r.kind === 'bool') {
    if (typeof v !== 'boolean') throw bad('must be true or false.');
    return v;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) throw bad('must be a number.');
  if (r.kind === 'int' && !Number.isInteger(v)) throw bad('must be a whole number.');
  if (v < r.min || v > r.max) throw bad(`must be between ${r.min} and ${r.max}.`);
  return v;
}

/** Mounts GET/PUT /admin/billing/rules on the coins module's admin router. */
export function billingRulesRoutes(admin) {
  admin.get('/admin/billing/rules', async (_req, res) => res.json(await readRules()));

  admin.put('/admin/billing/rules', async (req, res) => {
    const body = req.body ?? {};
    // Validate everything before writing anything: no half-applied change.
    const next = {};
    for (const key of Object.keys(RULES)) if (body[key] !== undefined) next[key] = check(key, body[key]);
    for (const [key, v] of Object.entries(next)) {
      await ensureSetting(key, v, RULES[key].label, RULES[key].desc);
      await Setting.updateOne({ key }, { $set: { value: String(v) } });
    }
    res.json(await readRules());
  });
}

export const RULE_KEYS = Object.keys(RULES);
