import { describe, it, expect } from 'vitest';
import { settlePosition } from './settlement';
import { buyCost } from './lmsr';

describe('settlePosition (resolution accounting — OQ-7 / OQ-8)', () => {
  it('pays 1.00 per winning YES share and books realized P&L (spec §7.6)', () => {
    // Buy 50 YES from 50¢: costBasis ≈ 27.08; resolve YES → payout 50, realized ≈ +22.92, a win.
    const basis = buyCost(0, 0, 'YES', 50, 150).amount;
    const r = settlePosition({ yesShares: 50, noShares: 0, costBasis: basis }, 'YES');
    expect(r.payout).toBe(50);
    expect(r.realizedPnL).toBeCloseTo(50 - basis, 6);
    expect(r.countsWin).toBe(true);
    expect(r.countsLoss).toBe(false);
  });

  it('losing shares pay 0 and count as a loss', () => {
    const r = settlePosition({ yesShares: 50, noShares: 0, costBasis: 27 }, 'NO');
    expect(r.payout).toBe(0);
    expect(r.realizedPnL).toBe(-27);
    expect(r.countsLoss).toBe(true);
    expect(r.countsWin).toBe(false);
  });

  it('an exact break-even counts as neither win nor loss', () => {
    const r = settlePosition({ yesShares: 10, noShares: 0, costBasis: 10 }, 'YES');
    expect(r.realizedPnL).toBe(0);
    expect(r.countsWin).toBe(false);
    expect(r.countsLoss).toBe(false);
  });

  it('a fully-exited position (0 shares) books trading P&L but does NOT count W/L (OQ-8)', () => {
    // Bought for 6, sold all for 7 → costBasis = 6 − 7 = −1, no shares held.
    const r = settlePosition({ yesShares: 0, noShares: 0, costBasis: -1 }, 'YES');
    expect(r.payout).toBe(0);
    expect(r.realizedPnL).toBe(1); // the +1 trading profit is realized
    expect(r.countsWin).toBe(false); // but not a W/L (didn't hold at resolution)
    expect(r.countsLoss).toBe(false);
  });
});
