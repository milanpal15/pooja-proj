/**
 * What the astrologer earns per minute, in coins, for a rate and platform share.
 * Same rule the API uses when it writes the earning row: floor(rate × (1 − share/100)).
 */
export function astrologerEarns(ratePerMin, sharePct) {
  const rate = Number(ratePerMin);
  const share = Number(sharePct);
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(share) || share < 0 || share > 100) return null;
  return Math.floor(rate * (1 - share / 100));
}
