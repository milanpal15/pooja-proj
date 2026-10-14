/**
 * The settings rows that move money (prices, fees, the calls kill switch, the payout rate). An `editor` may edit the
 * ordinary settings (support contacts) but writing one of THESE needs `money:edit`.
 *
 * ONE list for the backend: the engagement service guards its settings table with it. The wallet service's billing-rules
 * screen (`RULES` in services/wallet/.../billing-rules.routes.js) and the monolith's (`RULE_KEYS` in
 * pooja-api/src/modules/coins/billing-rules.routes.js) define the same keys with their own bounds; the monolith cannot
 * import this package (it is not a workspace member), so `tools/money-keys-parity.test.mjs` fails the day any of the three drifts.
 */
export const MONEY_SETTING_KEYS = Object.freeze([
  'minMinutes', 'ringTimeoutSec', 'defaultSharePct', 'payoutPaisePerCoin', 'callsEnabled',
  'coinsPerRupee', 'chadhavaServiceFee', 'chadhavaMinAmount', 'bookingCancelHours', 'prasadDelivery',
]);
