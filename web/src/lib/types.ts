// Firestore document shapes (mirrors specs/plan.md §5).

export type MarketCategory = 'lol_win' | 'lol_kda' | 'lol_cs' | 'futures' | 'joe';
export type MarketStatus = 'open' | 'locked' | 'resolved';
export type Outcome = 'YES' | 'NO';
export type Side = 'YES' | 'NO';

export interface UserDoc {
  displayName: string;
  email: string;
  balance: number;
  isAdmin: boolean;
  realizedProfit: number;
  wins: number;
  losses: number;
  createdAt: number;
}
export type User = UserDoc & { uid: string };

export interface LmsrState {
  qYes: number;
  qNo: number;
  b: number;
}
export interface PricePoint {
  t: number; // epoch ms
  y: number; // YES price in cents
}

export interface MarketDoc {
  title: string;
  category: MarketCategory;
  status: MarketStatus;
  gameId: string | null;
  line: number | null;
  lmsr: LmsrState;
  priceYes: number; // cached cents (float)
  volume: number;
  priceHistory: PricePoint[];
  outcome: Outcome | null;
  dayPST: string | null;
  createdAt: number;
  resolvedAt: number | null;
}
export type Market = MarketDoc & { id: string };

export interface GameDoc {
  status: MarketStatus;
  player?: { gameName: string; tagLine: string }; // tracked player for this game (multi-player)
  kdaLine: number;
  csLine: number;
  baselineMatchId: string;
  resolvedMatchId: string | null;
  marketIds: { win?: string; kda?: string; cs?: string }; // admin can create a subset
  createdAt: number;
  resolvedAt: number | null;
}
export type Game = GameDoc & { gameId: string };

export interface PositionDoc {
  uid: string;
  marketId: string;
  yesShares: number;
  noShares: number;
  costBasis: number;
  settled: boolean;
  createdAt: number;
  updatedAt: number;
}
export type Position = PositionDoc & { id: string };

export interface TradeDoc {
  uid: string;
  marketId: string;
  side: Outcome;
  action: 'BUY' | 'SELL';
  shares: number;
  cost: number;
  priceBefore: number;
  priceAfter: number;
  ts: number;
}
export type Trade = TradeDoc & { id: string };
