// ─────────────────────────────────────────────────────────────────────────────
// Client-side trading engine. All balance/position/market changes happen inside a
// Firestore transaction so concurrent trades can't corrupt LMSR state (spec BR-10).
// LMSR math is delegated to lib/lmsr.ts. See specs/plan.md §8.
// ─────────────────────────────────────────────────────────────────────────────
import { collection, doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import { buyCost, sellProceeds } from './lmsr';
import { MIN_BUY, CURRENCY } from '../config/constants';
import type { MarketDoc, PositionDoc, Side, UserDoc, PricePoint } from './types';

/** Typed error so the UI can show a friendly message (spec BR-6/BR-9). */
export class TradeError extends Error {
  constructor(
    message: string,
    public code: 'NOT_OPEN' | 'MIN_BUY' | 'FUNDS' | 'SHARES' | 'INPUT' | 'NOT_FOUND' = 'INPUT',
  ) {
    super(message);
    this.name = 'TradeError';
  }
}

const EPS = 1e-9;
const positionId = (uid: string, marketId: string) => `${uid}_${marketId}`;
const pushHistory = (hist: PricePoint[] | undefined, y: number, t: number): PricePoint[] =>
  [...(hist ?? []), { t, y }].slice(-200); // cap doc size (plan §5)

/** BUY `shares` of `side` in a market. Resolves with the cash cost. */
export async function buyShares(
  uid: string,
  marketId: string,
  side: Side,
  shares: number,
): Promise<number> {
  if (!(shares > 0)) throw new TradeError('Enter a number of shares greater than 0.', 'INPUT');

  return runTransaction(db, async (tx) => {
    const marketRef = doc(db, 'markets', marketId);
    const userRef = doc(db, 'users', uid);
    const posRef = doc(db, 'positions', positionId(uid, marketId));

    // ── reads first ──
    const mSnap = await tx.get(marketRef);
    if (!mSnap.exists()) throw new TradeError('Market not found.', 'NOT_FOUND');
    const m = mSnap.data() as MarketDoc;
    if (m.status !== 'open') throw new TradeError('This market is not open for trading.', 'NOT_OPEN');

    const uSnap = await tx.get(userRef);
    if (!uSnap.exists()) throw new TradeError('Your account was not found.', 'NOT_FOUND');
    const u = uSnap.data() as UserDoc;

    const pSnap = await tx.get(posRef);
    const prev = pSnap.exists() ? (pSnap.data() as PositionDoc) : null;

    // ── compute ──
    const { qYes, qNo, b } = m.lmsr;
    const quote = buyCost(qYes, qNo, side, shares, b);
    if (quote.amount < MIN_BUY - EPS)
      throw new TradeError(`Minimum buy is ${MIN_BUY} ${CURRENCY.symbol}.`, 'MIN_BUY');
    if (quote.amount > u.balance + EPS)
      throw new TradeError("You don't have enough cash for this buy.", 'FUNDS');

    const now = Date.now();
    const priceBefore = m.priceYes;
    const priceAfter = quote.newPriceYesCents;

    // ── writes ──
    tx.update(marketRef, {
      lmsr: { qYes: quote.newQYes, qNo: quote.newQNo, b },
      priceYes: priceAfter,
      volume: (m.volume ?? 0) + quote.amount,
      priceHistory: pushHistory(m.priceHistory, priceAfter, now),
      updatedAt: now,
    });
    tx.update(userRef, { balance: u.balance - quote.amount, updatedAt: now });
    tx.set(
      posRef,
      {
        uid,
        marketId,
        yesShares: (prev?.yesShares ?? 0) + (side === 'YES' ? shares : 0),
        noShares: (prev?.noShares ?? 0) + (side === 'NO' ? shares : 0),
        costBasis: (prev?.costBasis ?? 0) + quote.amount,
        settled: false,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      },
      { merge: true },
    );
    tx.set(doc(collection(db, 'trades')), {
      uid,
      marketId,
      side,
      action: 'BUY',
      shares,
      cost: quote.amount,
      priceBefore,
      priceAfter,
      ts: now,
    });

    return quote.amount;
  });
}

/** SELL `shares` of `side` the user holds. Resolves with the cash proceeds. */
export async function sellShares(
  uid: string,
  marketId: string,
  side: Side,
  shares: number,
): Promise<number> {
  if (!(shares > 0)) throw new TradeError('Enter a number of shares greater than 0.', 'INPUT');

  return runTransaction(db, async (tx) => {
    const marketRef = doc(db, 'markets', marketId);
    const userRef = doc(db, 'users', uid);
    const posRef = doc(db, 'positions', positionId(uid, marketId));

    const mSnap = await tx.get(marketRef);
    if (!mSnap.exists()) throw new TradeError('Market not found.', 'NOT_FOUND');
    const m = mSnap.data() as MarketDoc;
    if (m.status !== 'open') throw new TradeError('This market is not open for trading.', 'NOT_OPEN');

    const uSnap = await tx.get(userRef);
    if (!uSnap.exists()) throw new TradeError('Your account was not found.', 'NOT_FOUND');
    const u = uSnap.data() as UserDoc;

    const pSnap = await tx.get(posRef);
    const prev = pSnap.exists() ? (pSnap.data() as PositionDoc) : null;
    const held = side === 'YES' ? (prev?.yesShares ?? 0) : (prev?.noShares ?? 0);
    if (shares > held + EPS)
      throw new TradeError(`You only hold ${held} ${side} shares here.`, 'SHARES');

    const { qYes, qNo, b } = m.lmsr;
    const quote = sellProceeds(qYes, qNo, side, shares, b); // uses SELL_MODE default ('lmsr')

    const now = Date.now();
    const priceBefore = m.priceYes;
    const priceAfter = quote.newPriceYesCents;

    tx.update(marketRef, {
      lmsr: { qYes: quote.newQYes, qNo: quote.newQNo, b },
      priceYes: priceAfter,
      volume: (m.volume ?? 0) + quote.amount,
      priceHistory: pushHistory(m.priceHistory, priceAfter, now),
      updatedAt: now,
    });
    tx.update(userRef, { balance: u.balance + quote.amount, updatedAt: now });
    tx.set(
      posRef,
      {
        yesShares: (prev?.yesShares ?? 0) - (side === 'YES' ? shares : 0),
        noShares: (prev?.noShares ?? 0) - (side === 'NO' ? shares : 0),
        costBasis: (prev?.costBasis ?? 0) - quote.amount, // pre-resolution sells fold into basis (OQ-7)
        updatedAt: now,
      },
      { merge: true },
    );
    tx.set(doc(collection(db, 'trades')), {
      uid,
      marketId,
      side,
      action: 'SELL',
      shares,
      cost: quote.amount,
      priceBefore,
      priceAfter,
      ts: now,
    });

    return quote.amount;
  });
}
