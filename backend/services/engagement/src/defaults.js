import { MONEY_SETTING_KEYS } from '@bhakti/common';

/**
 * Everything this service seeds, copied from the monolith's seeds so a fresh `engagement` database matches
 * a fresh monolith one: flags (modules/flags/flag.defaults.js + modules/coins/seed.js) and settings
 * (modules/content/seed-content.json `settings`, modules/coins/seed.js, modules/calls/index.js).
 */
export const DEFAULT_FLAGS = [
  { key: 'virtualPooja', label: 'Virtual Pooja', desc: 'Aarti experience', enabled: true },
  { key: 'bhajan', label: 'Bhajan Library', desc: 'Media library tab', enabled: true },
  { key: 'chadhava', label: 'E-Chadhava', desc: 'Offerings & checkout', enabled: true },
  { key: 'journal', label: 'Daily Journal', desc: 'Mantra journal', enabled: true },
  { key: 'liveDarshan', label: 'Live Darshan', desc: 'Live temple stream', enabled: true },
  { key: 'payments', label: 'Coin purchases', desc: 'Buying coins with Razorpay', enabled: true },
  { key: 'announcements', label: 'Announcements', desc: 'Temple banners', enabled: true },
  { key: 'astrologerCalls', label: 'Astrologer Calls', desc: 'Talk to an astrologer', enabled: true },
  // SMS OTP sign-in is OFF by default (Firebase needs Blaze billing); every other flag defaults on.
  { key: 'phoneAuth', label: 'Mobile OTP Sign-in', desc: 'Needs Firebase Blaze billing', enabled: false },
];

export const DEFAULT_SETTINGS = [
  { key: 'prasadDelivery', value: '99', label: 'Prasad delivery fee (coins)', desc: 'Added to a booking when prasad delivery is chosen.' },
  { key: 'supportEmail', value: '', label: 'Support email', desc: 'Blank hides the Email button in Help & Support.' },
  { key: 'supportPhone', value: '', label: 'Support phone', desc: 'Dialable, e.g. +911800123456. Blank hides the Call button.' },
  { key: 'supportHours', value: '', label: 'Support hours (EN)', desc: 'Shown under the helpline heading.' },
  { key: 'supportHoursHi', value: '', label: 'Support hours (HI)', desc: '' },
  { key: 'coinsPerRupee', value: '1', label: 'Coins per rupee', desc: 'Base value used to work out sale percentages.' },
  { key: 'chadhavaServiceFee', value: '5', label: 'Chadhava service fee (coins)', desc: 'Added to every chadhava offering.' },
  { key: 'chadhavaMinAmount', value: '1', label: 'Chadhava minimum amount (coins)', desc: 'Smallest offering amount.' },
  { key: 'bookingCancelHours', value: '0', label: 'Booking refund cut-off (hours)', desc: 'Hours before the seva day after which a cancellation is not refunded. 0 = until the seva date.' },
  { key: 'minMinutes', value: '3', label: 'Minimum minutes to start a call', desc: 'A devotee needs coins for this many minutes before a call can begin.' },
  { key: 'ringTimeoutSec', value: '25', label: 'Ring timeout (seconds)', desc: 'How long an astrologer has to answer before the call counts as missed.' },
  { key: 'defaultSharePct', value: '30', label: 'Default platform share (%)', desc: 'Platform share pre-filled for a newly added astrologer.' },
  { key: 'payoutPaisePerCoin', value: '100', label: 'Payout per coin (paise)', desc: 'Rupee value, in paise, of one coin an astrologer earns.' },
  { key: 'callsEnabled', value: 'true', label: 'Astrologer calls enabled', desc: 'Kill switch: false refuses every new call.' },
];

/**
 * Settings that move money (prices, fees, the calls kill switch, payout rate). An `editor` may edit the
 * ordinary ones (support contacts) but these need `money:edit`. The list is @bhakti/common's
 * MONEY_SETTING_KEYS (parity-tested against the wallet's RULES and the monolith's RULE_KEYS in tools/money-keys-parity.test.mjs).
 */
export const MONEY_KEYS = [...MONEY_SETTING_KEYS];
