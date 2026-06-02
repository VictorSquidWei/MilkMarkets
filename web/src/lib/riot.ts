// Client wrappers around the single Cloud Function (riotProxy). The function does all
// Riot access server-side; the key never reaches the browser (spec C-4/C-5, plan §10).
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface LineGame {
  matchId: string;
  kda: number;
  csPerMin: number;
  durationSec: number;
  remake: boolean;
  win: boolean;
}
export interface ComputeLinesResult {
  kdaLine: number;
  csLine: number;
  sampleSize: number;
  baselineMatchId: string;
  games: LineGame[];
}
export interface ResolveLatestResult {
  newGame: boolean;
  matchId?: string;
  win?: boolean;
  kills?: number;
  deaths?: number;
  assists?: number;
  kda?: number;
  csPerMin?: number;
  gameDuration?: number;
  remake?: boolean;
}

export class RiotError extends Error {
  constructor(
    public code: 'RIOT_KEY' | 'RIOT_NOT_CONFIGURED' | 'NO_RANKED_GAMES' | 'PERMISSION' | 'UNKNOWN',
    message: string,
  ) {
    super(message);
    this.name = 'RiotError';
  }
}

export interface RiotPlayer {
  gameName: string;
  tagLine: string;
}

const riotProxy = httpsCallable<
  { action: string; player?: RiotPlayer; baselineMatchId?: string },
  unknown
>(functions, 'riotProxy');

function mapError(e: unknown): never {
  const msg = (e as { message?: string })?.message ?? '';
  if (msg.includes('RIOT_KEY_INVALID') || msg.includes('RIOT_RATE_LIMITED'))
    throw new RiotError('RIOT_KEY', 'Riot key expired or rate-limited — update it in the admin panel.');
  if (msg.includes('RIOT_NOT_CONFIGURED'))
    throw new RiotError(
      'RIOT_NOT_CONFIGURED',
      'Riot key/player not configured yet — set the key in the admin panel.',
    );
  if (msg.includes('NO_RANKED_GAMES'))
    throw new RiotError('NO_RANKED_GAMES', 'No ranked games found for the tracked player.');
  if (msg.includes('permission') || msg.includes('PERMISSION'))
    throw new RiotError('PERMISSION', 'Only the admin can fetch Riot data.');
  throw new RiotError('UNKNOWN', 'Riot request failed. Try again, or update the key in the admin panel.');
}

/** Fetch last-10 ranked stats for a player, compute KDA & CS/min lines, and the baseline match id. */
export async function computeLines(player: RiotPlayer): Promise<ComputeLinesResult> {
  try {
    const r = await riotProxy({ action: 'computeLines', player });
    return r.data as ComputeLinesResult;
  } catch (e) {
    return mapError(e);
  }
}

/** Fetch a player's most recent ranked match strictly newer than `baselineMatchId`. */
export async function resolveLatest(
  player: RiotPlayer | undefined,
  baselineMatchId: string,
): Promise<ResolveLatestResult> {
  try {
    const r = await riotProxy({ action: 'resolveLatest', player, baselineMatchId });
    return r.data as ResolveLatestResult;
  } catch (e) {
    return mapError(e);
  }
}
