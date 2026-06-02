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
import { LMSR_B } from '../config/constants';
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

export interface MarketSelection {
  win: boolean;
  kda: boolean;
  cs: boolean;
}

export const MAX_ACTIVE_GAMES = 3;

/**
 * Open a new LoL game for `player`, creating only the selected market types (spec US-G1/D-1.0).
 * One active game per player; at most MAX_ACTIVE_GAMES concurrent. CS/min is often skipped for
 * support/jungle players where role autofill makes it misleading.
 */
export async function openGame(
  player: { gameName: string; tagLine: string },
  lines: { kdaLine: number; csLine: number },
  baselineMatchId: string,
  selection: MarketSelection,
): Promise<string> {
  if (!selection.win && !selection.kda && !selection.cs)
    throw new Error('Select at least one market to create.');
  const gameName = player.gameName.trim();
  const tagLine = player.tagLine.trim().replace(/^#/, '');
  if (!gameName || !tagLine) throw new Error('Enter the player’s Riot ID (name and tag).');

  const activeSnap = await getDocs(
    query(collection(db, 'games'), where('status', 'in', ['open', 'locked'])),
  );
  const active = activeSnap.docs.map((d) => d.data() as GameDoc);
  if (active.length >= MAX_ACTIVE_GAMES)
    throw new Error(`Max ${MAX_ACTIVE_GAMES} games at once — resolve one before opening another.`);
  if (
    active.some(
      (g) =>
        g.player &&
        g.player.gameName.toLowerCase() === gameName.toLowerCase() &&
        g.player.tagLine.toLowerCase() === tagLine.toLowerCase(),
    )
  )
    throw new Error(`${gameName}#${tagLine} already has an active game — resolve it first.`);

  const playerName = gameName;
  const now = Date.now();
  const gameRef = doc(collection(db, 'games'));
  const gameId = gameRef.id;
  const base = newMarketBase(now);
  const today = dayPST(now);
  const marketIds: { win?: string; kda?: string; cs?: string } = {};

  const batch = writeBatch(db);
  if (selection.win) {
    const ref = doc(collection(db, 'markets'));
    marketIds.win = ref.id;
    batch.set(ref, {
      ...base,
      title: `Does ${playerName} win this game?`,
      category: 'lol_win',
      gameId,
      line: null,
      dayPST: today,
    } satisfies MarketDoc);
  }
  if (selection.kda) {
    const ref = doc(collection(db, 'markets'));
    marketIds.kda = ref.id;
    batch.set(ref, {
      ...base,
      title: `${playerName} · KDA over ${lines.kdaLine}?`,
      category: 'lol_kda',
      gameId,
      line: lines.kdaLine,
      dayPST: today,
    } satisfies MarketDoc);
  }
  if (selection.cs) {
    const ref = doc(collection(db, 'markets'));
    marketIds.cs = ref.id;
    batch.set(ref, {
      ...base,
      title: `${playerName} · CS/min over ${lines.csLine}?`,
      category: 'lol_cs',
      gameId,
      line: lines.csLine,
      dayPST: today,
    } satisfies MarketDoc);
  }
  batch.set(gameRef, {
    status: 'open',
    player: { gameName, tagLine },
    kdaLine: lines.kdaLine,
    csLine: lines.csLine,
    baselineMatchId,
    resolvedMatchId: null,
    marketIds,
    createdAt: now,
    resolvedAt: null,
  } satisfies GameDoc);

  await batch.commit();
  return gameId;
}

/** Convenience: lock ALL of a game's markets at once (e.g. at kickoff). Per-market, reversible. */
export async function lockGame(game: Game): Promise<void> {
  const now = Date.now();
  const batch = writeBatch(db);
  for (const id of [game.marketIds.win, game.marketIds.kda, game.marketIds.cs]) {
    if (id) batch.update(doc(db, 'markets', id), { status: 'locked', updatedAt: now });
  }
  // game lifecycle stays 'open' (active) — locking is per-market now (spec US-G2).
  await batch.commit();
}

/** Lock a single market — stops its trading. Reversible via unlockMarket (admin; spec US-G2). */
export async function lockMarket(marketId: string): Promise<void> {
  await updateDoc(doc(db, 'markets', marketId), { status: 'locked', updatedAt: Date.now() });
}

/** Re-open a locked market for trading (admin; spec US-G2). */
export async function unlockMarket(marketId: string): Promise<void> {
  await updateDoc(doc(db, 'markets', marketId), { status: 'open', updatedAt: Date.now() });
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

/** Resolve a LoL game's markets from one Riot match result; only resolves markets that exist (US-G3). */
export async function resolveGame(game: Game, riot: ResolveLatestResult): Promise<void> {
  if (!riot.newGame || riot.win === undefined || riot.kda === undefined || riot.csPerMin === undefined)
    throw new Error('No new game found since this market opened.');

  if (game.marketIds.win) await settleMarket(game.marketIds.win, riot.win ? 'YES' : 'NO');
  if (game.marketIds.kda)
    await settleMarket(game.marketIds.kda, riot.kda > game.kdaLine ? 'YES' : 'NO'); // ties → NO (OQ-2)
  if (game.marketIds.cs)
    await settleMarket(game.marketIds.cs, riot.csPerMin > game.csLine ? 'YES' : 'NO');

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
    if (id) refs = refs.concat(await marketRefsToDelete(id));
  }
  refs.push(doc(db, 'games', game.gameId));
  await deleteRefs(refs);
}
