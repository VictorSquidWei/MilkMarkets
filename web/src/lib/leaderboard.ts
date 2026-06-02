import { mtm } from './lmsr';
import type { Market, Position, User } from './types';

export interface LeaderRow {
  uid: string;
  displayName: string;
  isAdmin: boolean;
  cash: number;
  openValue: number; // mark-to-market of open positions
  bankroll: number; // cash + openValue
  realizedProfit: number;
  wins: number;
  losses: number;
}

/**
 * Build leaderboard rows (plan §11). Bankroll/MTM are computed live from positions + cached
 * market prices; realized profit and W/L come from the cached counters on each user doc.
 */
export function buildLeaderboard(
  users: User[],
  positions: Position[],
  markets: Market[],
): LeaderRow[] {
  const marketById = new Map(markets.map((m) => [m.id, m]));
  const openValueByUid = new Map<string, number>();

  for (const p of positions) {
    if (p.settled) continue;
    const m = marketById.get(p.marketId);
    if (!m || m.status === 'resolved') continue;
    const value = mtm(p.yesShares, p.noShares, m.priceYes / 100);
    openValueByUid.set(p.uid, (openValueByUid.get(p.uid) ?? 0) + value);
  }

  return users
    .map((u) => {
      const openValue = openValueByUid.get(u.uid) ?? 0;
      return {
        uid: u.uid,
        displayName: u.displayName,
        isAdmin: u.isAdmin,
        cash: u.balance,
        openValue,
        bankroll: u.balance + openValue,
        realizedProfit: u.realizedProfit ?? 0,
        wins: u.wins ?? 0,
        losses: u.losses ?? 0,
      };
    })
    .sort((a, b) => b.bankroll - a.bankroll);
}
