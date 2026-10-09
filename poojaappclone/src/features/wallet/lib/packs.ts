import type { CoinPack } from '@/lib/api';

/**
 * The smallest pack that covers `shortfall` coins — "Just enough".
 *
 * Smallest by coins, not by price: the point is to cover the gap without
 * making the devotee buy a bigger pack than they need. Undefined when even the
 * largest pack is short; the caller then offers the biggest one and the
 * checkout will simply ask again for whatever is still missing.
 */
function justEnoughPack(packs: readonly CoinPack[], shortfall: number): CoinPack | undefined {
  return packs
    .filter((p) => p.coins >= shortfall)
    .sort((a, b) => a.coins - b.coins || a.price - b.price)[0];
}

/** The pack with the highest sale %. Undefined when nothing is on sale. */
function bestValuePack(packs: readonly CoinPack[]): CoinPack | undefined {
  return packs
    .filter((p) => p.onSale && p.salePct > 0)
    .sort((a, b) => b.salePct - a.salePct || b.coins - a.coins)[0];
}

/** The largest pack, for when nothing covers the shortfall in one go. */
function largestPack(packs: readonly CoinPack[]): CoinPack | undefined {
  return [...packs].sort((a, b) => b.coins - a.coins)[0];
}

/** The two suggestions the "not enough coins" sheet shows, without duplicates. */
export function suggestPacks(
  packs: readonly CoinPack[],
  shortfall: number,
): { justEnough?: CoinPack; best?: CoinPack } {
  const justEnough = justEnoughPack(packs, shortfall) ?? largestPack(packs);
  const best = bestValuePack(packs);
  return { justEnough, best: best && best.id !== justEnough?.id ? best : undefined };
}
