// ─────────────────────────────────────────────────────────────────────────────
// Hanson LMSR engine for binary YES/NO markets. PURE math — no Firestore/React.
// See specs/plan.md §7. All functions are numerically stable.
// Invariant: qYes = Σ users' yesShares, qNo = Σ users' noShares (both ≥ 0).
// ─────────────────────────────────────────────────────────────────────────────
import { LMSR_B, SELL_MODE } from '../config/constants';

export type Side = 'YES' | 'NO';

/** Numerically stable logistic sigmoid: 1 / (1 + e^-x). */
function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/** Price of YES as a probability in [0, 1]. priceNo = 1 - priceYes. */
export function priceYes(qYes: number, qNo: number, b: number = LMSR_B): number {
  return sigmoid((qYes - qNo) / b);
}

/** Price of YES in cents (float, e.g. 58.26). Round only for display. */
export function priceYesCents(qYes: number, qNo: number, b: number = LMSR_B): number {
  return 100 * priceYes(qYes, qNo, b);
}

/**
 * LMSR (qYes, qNo) that makes the market START at a given YES price in cents.
 * This is a virtual liquidity offset (the "house" seed) — these q's aren't backed by user
 * shares, which is fine: LMSR is defined for any real q, the price still moves normally as
 * people trade, and users still can't sell more than they personally hold.
 */
export function initialQForPrice(
  priceCents: number,
  b: number = LMSR_B,
): { qYes: number; qNo: number } {
  const p = Math.min(99, Math.max(1, priceCents)) / 100;
  const d = b * Math.log(p / (1 - p)); // = qYes − qNo needed for this price
  return d >= 0 ? { qYes: d, qNo: 0 } : { qYes: 0, qNo: -d };
}

/** LMSR cost function C(q) = b·ln(Σ exp(q_i/b)), via log-sum-exp (overflow-safe). */
export function cost(qYes: number, qNo: number, b: number = LMSR_B): number {
  const m = Math.max(qYes, qNo);
  return m + b * Math.log(Math.exp((qYes - m) / b) + Math.exp((qNo - m) / b));
}

export interface TradeQuote {
  /** Cash cost (buy) or proceeds (sell), in money units (🥛). Always ≥ 0. */
  amount: number;
  newQYes: number;
  newQNo: number;
  /** New YES price in cents (float). */
  newPriceYesCents: number;
}

/** Cost to BUY `shares` of `side`. Integral of price over the move (moves price up). */
export function buyCost(
  qYes: number,
  qNo: number,
  side: Side,
  shares: number,
  b: number = LMSR_B,
): TradeQuote {
  const newQYes = side === 'YES' ? qYes + shares : qYes;
  const newQNo = side === 'NO' ? qNo + shares : qNo;
  const amount = cost(newQYes, newQNo, b) - cost(qYes, qNo, b);
  return { amount, newQYes, newQNo, newPriceYesCents: priceYesCents(newQYes, newQNo, b) };
}

/**
 * Proceeds to SELL `shares` of `side`. Reduces the held side's quantity (moves price).
 *  - 'lmsr' (default): proceeds = C(before) − C(after). Fee-free, ≈ mid for small sells, NO pump.
 *  - 'mid'           : proceeds = shares × current mid. Literal spec wording; pump risk.
 * Caller must ensure `shares` ≤ the user's held shares on that side (q can't go negative).
 */
export function sellProceeds(
  qYes: number,
  qNo: number,
  side: Side,
  shares: number,
  b: number = LMSR_B,
  mode: 'lmsr' | 'mid' = SELL_MODE,
): TradeQuote {
  const newQYes = side === 'YES' ? qYes - shares : qYes;
  const newQNo = side === 'NO' ? qNo - shares : qNo;

  let amount: number;
  if (mode === 'lmsr') {
    amount = cost(qYes, qNo, b) - cost(newQYes, newQNo, b);
  } else {
    const pYes = priceYes(qYes, qNo, b);
    const mid = side === 'YES' ? pYes : 1 - pYes;
    amount = shares * mid;
  }
  return { amount, newQYes, newQNo, newPriceYesCents: priceYesCents(newQYes, newQNo, b) };
}

/** Mark-to-market value of a position at the current YES probability (each share → 1.00). */
export function mtm(yesShares: number, noShares: number, pYes: number): number {
  return yesShares * pYes + noShares * (1 - pYes);
}

/** Round to the nearest 0.5 (used for KDA & CS/min lines; spec LN-3/LN-4). */
export const round0_5 = (x: number): number => Math.round(x * 2) / 2;
