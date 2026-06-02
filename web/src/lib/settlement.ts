// Pure resolution accounting (spec BR-12, OQ-7, OQ-8). No Firestore — unit-testable.
import type { Outcome } from './types';

export interface SettleResult {
  payout: number; // cash added to balance (1.00 per winning share)
  realizedPnL: number; // payout − net cash invested (costBasis)
  countsWin: boolean; // W/L counts only positions HELD at resolution (OQ-8)
  countsLoss: boolean;
}

export function settlePosition(
  pos: { yesShares: number; noShares: number; costBasis: number },
  outcome: Outcome,
): SettleResult {
  const payout = outcome === 'YES' ? pos.yesShares : pos.noShares; // losing shares pay 0
  const realizedPnL = payout - pos.costBasis;
  const held = pos.yesShares + pos.noShares > 0;
  return {
    payout,
    realizedPnL,
    countsWin: held && realizedPnL > 0,
    countsLoss: held && realizedPnL < 0,
  };
}
