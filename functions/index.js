/**
 * Milk Market — the ONE Cloud Function: a server-side Riot API proxy (spec C-5, plan §10).
 *
 * It does Riot access only — NO money logic. It is admin-gated, reads the Riot key + puuid
 * from the server-only `config/riot` doc (Admin SDK bypasses security rules), and returns
 * derived numbers (lines / win-kda-cs) — never the key itself.
 *
 * Actions (callable `riotProxy`, dispatched on data.action):
 *   - 'computeLines'   → KDA & CS/min lines from the last ranked games + baselineMatchId
 *   - 'resolveLatest'  → the most recent ranked match strictly newer than baselineMatchId
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

// ── constants (the function keeps its own copy; it can't import from web/) ──
const RANKED_QUEUES = [420, 440]; // ranked solo + flex
const LINE_SAMPLE_SIZE = 10;
const MIN_GAME_SECONDS = 300; // remake filter (OQ-4)
const AMERICAS = 'https://americas.api.riotgames.com'; // Account-V1 + Match-V5 routing for NA
const TRACKED = { gameName: 'Drogo400', tagLine: 'NA1' }; // fallback only; real value is meta/tracked

const round0_5 = (x) => Math.round(x * 2) / 2;
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
// Match ids look like "NA1_1234567890"; the numeric suffix increases with time.
const seq = (id) => {
  const n = Number(String(id).split('_')[1]);
  return Number.isFinite(n) ? n : 0;
};

async function riotGet(url, apiKey) {
  const res = await fetch(url, { headers: { 'X-Riot-Token': apiKey } });
  if (res.status === 403) throw new HttpsError('failed-precondition', 'RIOT_KEY_INVALID');
  if (res.status === 429) throw new HttpsError('resource-exhausted', 'RIOT_RATE_LIMITED');
  if (!res.ok) throw new HttpsError('internal', `RIOT_HTTP_${res.status}`);
  return res.json();
}

async function getConfig() {
  const snap = await db.doc('config/riot').get();
  const cfg = snap.exists ? snap.data() : null;
  if (!cfg || !cfg.apiKey || String(cfg.apiKey).startsWith('RGAPI-XXXX'))
    throw new HttpsError('failed-precondition', 'RIOT_NOT_CONFIGURED');
  return cfg;
}

// The tracked player is admin-editable at runtime (meta/tracked), so resolve the puuid fresh
// each call from the current Riot ID — switching players needs no redeploy and no cache to bust.
async function getTracked() {
  const snap = await db.doc('meta/tracked').get();
  const d = snap.exists ? snap.data() : null;
  return {
    gameName: (d && d.gameName) || TRACKED.gameName,
    tagLine: (d && d.tagLine) || TRACKED.tagLine,
  };
}

// Per-request player {gameName, tagLine} for multi-player; falls back to meta/tracked if absent.
function playerFromReq(data) {
  const p = data && data.player;
  return p && p.gameName && p.tagLine
    ? { gameName: String(p.gameName), tagLine: String(p.tagLine) }
    : null;
}

async function resolvePuuid(apiKey, tracked) {
  const acct = await riotGet(
    `${AMERICAS}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      tracked.gameName,
    )}/${encodeURIComponent(tracked.tagLine)}`,
    apiKey,
  );
  return acct.puuid;
}

// Merge ranked queues, dedupe, sort newest-first.
async function rankedMatchIds(puuid, apiKey, perQueue) {
  const lists = await Promise.all(
    RANKED_QUEUES.map((q) =>
      riotGet(
        `${AMERICAS}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${q}&start=0&count=${perQueue}`,
        apiKey,
      ),
    ),
  );
  const merged = Array.from(new Set(lists.flat()));
  merged.sort((a, b) => seq(b) - seq(a));
  return merged;
}

function extract(match, puuid) {
  const info = match.info;
  const p = (info.participants || []).find((x) => x.puuid === puuid);
  if (!p) return null;
  let dur = info.gameDuration;
  if (dur > 100000) dur = dur / 1000; // legacy millisecond guard
  const kda = (p.kills + p.assists) / Math.max(1, p.deaths);
  const cs = (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
  const csPerMin = cs / (dur / 60);
  return {
    matchId: match.metadata.matchId,
    win: !!p.win,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    kda,
    csPerMin,
    durationSec: dur,
    remake: dur < MIN_GAME_SECONDS || !!p.gameEndedInEarlySurrender,
  };
}

exports.riotProxy = onCall(async (request) => {
  // ── admin gate (spec AC-J1.2 / I1) ──
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists || userSnap.data().isAdmin !== true)
    throw new HttpsError('permission-denied', 'PERMISSION_ADMIN_ONLY');

  const cfg = await getConfig();
  const action = request.data && request.data.action;

  if (action === 'computeLines') {
    const tracked = playerFromReq(request.data) || (await getTracked());
    const puuid = await resolvePuuid(cfg.apiKey, tracked);
    const ids = await rankedMatchIds(puuid, cfg.apiKey, 15);
    if (ids.length === 0) throw new HttpsError('failed-precondition', 'NO_RANKED_GAMES');
    const baselineMatchId = ids[0]; // most recent overall (remake or not) → stale guard (OQ-12)

    const games = [];
    for (const id of ids) {
      if (games.length >= LINE_SAMPLE_SIZE) break;
      const match = await riotGet(`${AMERICAS}/lol/match/v5/matches/${id}`, cfg.apiKey);
      const g = extract(match, puuid);
      if (!g || g.remake) continue; // exclude remakes from the line sample; backfill onward
      games.push(g);
    }
    if (games.length === 0) throw new HttpsError('failed-precondition', 'NO_RANKED_GAMES');

    return {
      kdaLine: round0_5(mean(games.map((g) => g.kda))),
      csLine: round0_5(mean(games.map((g) => g.csPerMin))),
      sampleSize: games.length,
      baselineMatchId,
      games,
    };
  }

  if (action === 'resolveLatest') {
    const tracked = playerFromReq(request.data) || (await getTracked());
    const puuid = await resolvePuuid(cfg.apiKey, tracked);
    const baseline = request.data.baselineMatchId;
    const ids = await rankedMatchIds(puuid, cfg.apiKey, 5);
    if (ids.length === 0 || ids[0] === baseline) return { newGame: false }; // no game since open
    const match = await riotGet(`${AMERICAS}/lol/match/v5/matches/${ids[0]}`, cfg.apiKey);
    const g = extract(match, puuid);
    if (!g) return { newGame: false };
    return { newGame: true, ...g };
  }

  throw new HttpsError('invalid-argument', 'UNKNOWN_ACTION');
});
