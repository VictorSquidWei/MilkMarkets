// ─────────────────────────────────────────────────────────────────────────────
// Admin market lifecycle + resolution (client-side, transaction-backed).
// LoL: openGame / lockGame / resolveGame.  Joe: createJoe / resolveJoe.
// Resolution is "lock → query holders → one atomic payout transaction" (plan §9).
// ─────────────────────────────────────────────────────────────────────────────
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type FieldValue,
} from 'firebase/firestore';
import { db } from './firebase';
import { LMSR_B, TRACKED_PLAYER } from '../config/constants';
import { dayPST } from './time';
import type { Game, GameDoc, MarketDoc, Outcome, PositionDoc } from './types';
import type { ResolveLatestResult } from './riot';
import { settlePosition } from './settlement';
import { initialQForPrice, priceYesCents } from './lmsr';

/** Fresh LMSR market scaffold starting at `priceCents` (default 50¢). */
function newMarketBase(now: number, priceCents = 50) {
  const { qYes, qNo } = initialQForPrice(priceCents, LMSR_B);
  const price = priceYesCents(qYes, qNo, LMSR_B);
  return {
    status: 'open' as const,
    lmsr: { qYes, qNo, b: LMSR_B },
    priceYes: price,
    volume: 0,
    priceHistory: [{ t: now, y: price }],
    outcome: null as Outcome | null,
    createdAt: now,
    resolvedAt: null as number | null,
  };
}

/** Open a new LoL game: 3 markets + a game doc. Blocks if a game is still unresolved (OQ-11). */
export async function openGame(
  lines: { kdaLine: number; csLine: number },
  baselineMatchId: string,
): Promise<string> {
  const active = await getDocs(
    query(collection(db, 'games'), where('status', 'in', ['open', 'locked'])),
  );
  if (!active.empty)
    throw new Error('Resolve the current LoL game before opening a new one.');

  // Use the currently-tracked player's name in the Win market title.
  const trackedSnap = await getDoc(doc(db, 'meta', 'tracked'));
  const playerName =
    (trackedSnap.exists() && (trackedSnap.data() as { gameName?: string }).gameName) ||
    TRACKED_PLAYER.gameName;

  const now = Date.now();
  const gameRef = doc(collection(db, 'games'));
  const gameId = gameRef.id;
  const winRef = doc(collection(db, 'markets'));
  const kdaRef = doc(collection(db, 'markets'));
  const csRef = doc(collection(db, 'markets'));
  const base = newMarketBase(now);
  const today = dayPST(now);

  const batch = writeBatch(db);
  batch.set(winRef, {
    ...base,
    title: `Does ${playerName} win this game?`,
    category: 'lol_win',
    gameId,
    line: null,
    dayPST: today,
  } satisfies MarketDoc);
  batch.set(kdaRef, {
    ...base,
    title: `KDA over ${lines.kdaLine}?`,
    category: 'lol_kda',
    gameId,
    line: lines.kdaLine,
    dayPST: today,
  } satisfies MarketDoc);
  batch.set(csRef, {
    ...base,
    title: `CS/min over ${lines.csLine}?`,
    category: 'lol_cs',
    gameId,
    line: lines.csLine,
    dayPST: today,
  } satisfies MarketDoc);
  batch.set(gameRef, {
    status: 'open',
    kdaLine: lines.kdaLine,
    csLine: lines.csLine,
    baselineMatchId,
    resolvedMatchId: null,
    marketIds: { win: winRef.id, kda: kdaRef.id, cs: csRef.id },
    createdAt: now,
    resolvedAt: null,
  } satisfies GameDoc);

  await batch.commit();
  return gameId;
}

/** Lock all 3 markets of a game (status → locked, trading stops; spec BR-13). */
export async function lockGame(game: Game): Promise<void> {
  const now = Date.now();
  const batch = writeBatch(db);
  for (const id of [game.marketIds.win, game.marketIds.kda, game.marketIds.cs]) {
    batch.update(doc(db, 'markets', id), { status: 'locked', updatedAt: now });
  }
  batch.update(doc(db, 'games', game.gameId), { status: 'locked' });
  await batch.commit();
}

/**
 * Settle a single market to `outcome`: pay winning shares 1.00, book realized P&L and W/L
 * (only for holders at resolution — OQ-8), mark positions settled. Idempotent: the in-txn
 * `status === 'resolved'` gate prevents double-payout. Locks the market first if still open.
 */
export async function settleMarket(marketId: string, outcome: Outcome): Promise<void> {
  const marketRef = doc(db, 'markets', marketId);
  const pre = await getDoc(marketRef);
  if (!pre.exists()) throw new Error('Market not found.');
  const preData = pre.data() as MarketDoc;
  if (preData.status === 'resolved') return; // already settled
  if (preData.status === 'open') await updateDoc(marketRef, { status: 'locked', updatedAt: Date.now() });

  // Market is now locked → the holder set is frozen; safe to query outside the transaction.
  const posSnap = await getDocs(query(collection(db, 'positions'), where('marketId', '==', marketId)));
  const positions = posSnap.docs.map((d) => ({ ref: d.ref, ...(d.data() as PositionDoc) }));

  await runTransaction(db, async (tx) => {
    const mSnap = await tx.get(marketRef); // sole read → idempotency gate + conflict detection
    if (!mSnap.exists()) return;
    if ((mSnap.data() as MarketDoc).status === 'resolved') return;

    const now = Date.now();
    for (const p of positions) {
      if (p.settled) continue;
      const s = settlePosition(p, outcome);

      const userUpdate: Record<string, number | FieldValue> = {
        balance: increment(s.payout),
        realizedProfit: increment(s.realizedPnL),
        updatedAt: now,
      };
      if (s.countsWin) userUpdate.wins = increment(1);
      if (s.countsLoss) userUpdate.losses = increment(1);

      tx.update(doc(db, 'users', p.uid), userUpdate);
      tx.update(p.ref, { settled: true, updatedAt: now });
    }
    tx.update(marketRef, { status: 'resolved', outcome, resolvedAt: now });
  });
}

/** Resolve all 3 markets of a LoL game from one Riot match result (spec US-G3). */
export async function resolveGame(game: Game, riot: ResolveLatestResult): Promise<void> {
  if (!riot.newGame || riot.win === undefined || riot.kda === undefined || riot.csPerMin === undefined)
    throw new Error('No new game found since this market opened.');

  const winOutcome: Outcome = riot.win ? 'YES' : 'NO';
  const kdaOutcome: Outcome = riot.kda > game.kdaLine ? 'YES' : 'NO'; // ties → NO (OQ-2)
  const csOutcome: Outcome = riot.csPerMin > game.csLine ? 'YES' : 'NO';

  await settleMarket(game.marketIds.win, winOutcome);
  await settleMarket(game.marketIds.kda, kdaOutcome);
  await settleMarket(game.marketIds.cs, csOutcome);

  await updateDoc(doc(db, 'games', game.gameId), {
    status: 'resolved',
    resolvedMatchId: riot.matchId ?? null,
    resolvedAt: Date.now(),
  });
}

/**
 * Create a Joe market. Multiple per PST day are allowed. The admin sets the starting YES price
 * (1–99¢); the market still moves via LMSR as people trade.
 */
export async function createJoe(questionText: string, initialPriceCents = 50): Promise<string> {
  const text = questionText.trim();
  if (!text) throw new Error('Enter a question.');
  const price = Number.isFinite(initialPriceCents) ? initialPriceCents : 50;

  const now = Date.now();
  const ref = doc(collection(db, 'markets'));
  const batch = writeBatch(db);
  batch.set(ref, {
    ...newMarketBase(now, price),
    title: text,
    category: 'joe',
    gameId: null,
    line: null,
    dayPST: dayPST(now),
  } satisfies MarketDoc);
  await batch.commit();
  return ref.id;
}

/** Resolve a Joe market manually to YES or NO (spec US-H2). */
export async function resolveJoe(marketId: string, outcome: Outcome): Promise<void> {
  await settleMarket(marketId, outcome);
}

// ── History cleanup (admin) ──────────────────────────────────────────────────
// Deletes a resolved market/game and its positions + trades. This removes the RECORD only —
// payouts already applied at resolution are final (balances / realizedProfit / wins / losses are
// cached on user docs and are NOT touched). Consistent with the no-void policy (BR-14).

async function marketRefsToDelete(marketId: string): Promise<DocumentReference[]> {
  const refs: DocumentReference[] = [];
  const pos = await getDocs(query(collection(db, 'positions'), where('marketId', '==', marketId)));
  pos.forEach((d) => refs.push(d.ref));
  const tr = await getDocs(query(collection(db, 'trades'), where('marketId', '==', marketId)));
  tr.forEach((d) => refs.push(d.ref));
  refs.push(doc(db, 'markets', marketId));
  return refs;
}

async function deleteRefs(refs: DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

/** Delete a single resolved market (e.g. a Joe market) and its bets. */
export async function deleteMarketCascade(marketId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'markets', marketId));
  if (snap.exists() && (snap.data() as MarketDoc).status !== 'resolved')
    throw new Error('Only resolved markets can be deleted.');
  await deleteRefs(await marketRefsToDelete(marketId));
}

/** Delete a resolved LoL game: its 3 markets + their bets + the game doc. */
export async function deleteGameCascade(game: Game): Promise<void> {
  if (game.status !== 'resolved') throw new Error('Resolve the game before deleting it.');
  let refs: DocumentReference[] = [];
  for (const id of [game.marketIds.win, game.marketIds.kda, game.marketIds.cs]) {
    refs = refs.concat(await marketRefsToDelete(id));
  }
  refs.push(doc(db, 'games', game.gameId));
  await deleteRefs(refs);
}
