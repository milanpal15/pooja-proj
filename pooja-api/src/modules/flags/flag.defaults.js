/** Default features seeded on first run. */
export const DEFAULT_FLAGS = [
  { key: 'virtualPooja', label: 'Virtual Pooja', desc: 'Aarti experience', enabled: true },
  { key: 'bhajan', label: 'Bhajan Library', desc: 'Media library tab', enabled: true },
  { key: 'chadhava', label: 'E-Chadhava', desc: 'Offerings & checkout', enabled: true },
  { key: 'journal', label: 'Daily Journal', desc: 'Mantra journal', enabled: true },
  { key: 'liveDarshan', label: 'Live Darshan', desc: 'Live temple stream', enabled: true },
  { key: 'payments', label: 'Coin purchases', desc: 'Buying coins with Razorpay', enabled: true },
  { key: 'announcements', label: 'Announcements', desc: 'Temple banners', enabled: true },
  { key: 'astrologerCalls', label: 'Astrologer Calls', desc: 'Talk to an astrologer', enabled: true },
  /**
   * SMS OTP sign-in. **Off by default**, unlike every other flag.
   *
   * Firebase stopped sending verification SMS on the free Spark plan in
   * September 2024 — it now needs a Blaze billing account and charges per
   * message. With this off the app offers Google sign-in only, instead of a
   * Mobile button that always fails with BILLING_NOT_ENABLED. Turn it on the
   * day billing is enabled; no app release needed.
   */
  { key: 'phoneAuth', label: 'Mobile OTP Sign-in', desc: 'Needs Firebase Blaze billing', enabled: false },
];
