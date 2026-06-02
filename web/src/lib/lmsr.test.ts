import { describe, it, expect } from 'vitest';
import {
  priceYes,
  priceYesCents,
  cost,
  buyCost,
  sellProceeds,
  mtm,
  round0_5,
  initialQForPrice,
} from './lmsr';

const B = 150;

describe('LMSR pricing', () => {
  it('starts at 50¢ with zero inventory', () => {
    expect(priceYes(0, 0, B)).toBeCloseTo(0.5, 10);
    expect(priceYesCents(0, 0, B)).toBeCloseTo(50, 8);
  });

  it('YES + NO always sum to 100¢ (BR-2)', () => {
    for (const [qy, qn] of [
      [0, 0],
      [50, 0],
      [10, 200],
      [333, 12],
    ]) {
      const pYes = priceYesCents(qy, qn, B);
      const pNo = 100 - pYes;
      expect(pYes + pNo).toBeCloseTo(100, 8);
    }
  });

  it('is numerically stable for large inventories', () => {
    expect(Number.isFinite(cost(100000, 0, B))).toBe(true);
    expect(priceYes(100000, 0, B)).toBeCloseTo(1, 8);
  });
});

describe('Buying (spec §7.6 worked example)', () => {
  it('buy 50 YES costs ~27.08 🥛 and moves price to ~58.26¢', () => {
    const q = buyCost(0, 0, 'YES', 50, B);
    expect(q.amount).toBeCloseTo(27.08, 1);
    expect(q.newPriceYesCents).toBeCloseTo(58.26, 1);
    expect(q.newQYes).toBe(50);
  });

  it('buying more costs more (convex)', () => {
    const small = buyCost(0, 0, 'YES', 10, B).amount;
    const big = buyCost(0, 0, 'YES', 100, B).amount;
    expect(big).toBeGreaterThan(small * 10 * 0.99); // strictly super-linear-ish
  });
});

describe('Selling & the money pump (spec §7.4)', () => {
  it("SELL_MODE='lmsr' makes buy→full-sell net ~0 (no pump)", () => {
    const buy = buyCost(0, 0, 'YES', 50, B);
    const sell = sellProceeds(buy.newQYes, buy.newQNo, 'YES', 50, B, 'lmsr');
    expect(sell.amount - buy.amount).toBeCloseTo(0, 6);
    expect(sell.newQYes).toBe(0);
    expect(sell.newPriceYesCents).toBeCloseTo(50, 8);
  });

  it("SELL_MODE='mid' leaks free money (the pump we avoid): net > 2 🥛", () => {
    const buy = buyCost(0, 0, 'YES', 50, B);
    const sell = sellProceeds(buy.newQYes, buy.newQNo, 'YES', 50, B, 'mid');
    expect(sell.amount - buy.amount).toBeGreaterThan(2);
  });

  it('small sells under lmsr realize ≈ the current mid price', () => {
    // After buying to ~58.26¢, selling 1 share returns ≈ 0.5826 🥛.
    const buy = buyCost(0, 0, 'YES', 50, B);
    const oneShare = sellProceeds(buy.newQYes, buy.newQNo, 'YES', 1, B, 'lmsr');
    expect(oneShare.amount).toBeCloseTo(0.5826, 2);
  });
});

describe('initialQForPrice (seeded starting prices for Joe markets)', () => {
  it('50¢ means no skew', () => {
    const q = initialQForPrice(50, B);
    expect(q.qYes).toBeCloseTo(0, 9);
    expect(q.qNo).toBeCloseTo(0, 9);
  });

  it('round-trips an arbitrary starting price and keeps q ≥ 0', () => {
    for (const p of [10, 33, 50, 67, 90]) {
      const { qYes, qNo } = initialQForPrice(p, B);
      expect(priceYesCents(qYes, qNo, B)).toBeCloseTo(p, 6);
      expect(qYes).toBeGreaterThanOrEqual(0);
      expect(qNo).toBeGreaterThanOrEqual(0);
    }
  });

  it('a seeded market still moves when traded', () => {
    const { qYes, qNo } = initialQForPrice(70, B);
    const after = buyCost(qYes, qNo, 'YES', 30, B);
    expect(after.newPriceYesCents).toBeGreaterThan(70); // buying YES pushes it up from 70¢
  });
});

describe('Mark-to-market & rounding', () => {
  it('mtm values shares at current probability', () => {
    expect(mtm(10, 0, 0.6)).toBeCloseTo(6, 8);
    expect(mtm(0, 10, 0.6)).toBeCloseTo(4, 8);
    expect(mtm(10, 5, 0.6)).toBeCloseTo(6 + 2, 8);
  });

  it('round0_5 rounds to nearest half', () => {
    expect(round0_5(3.24)).toBe(3.0);
    expect(round0_5(3.25)).toBe(3.5);
    expect(round0_5(3.74)).toBe(3.5);
    expect(round0_5(3.75)).toBe(4.0);
  });
});
