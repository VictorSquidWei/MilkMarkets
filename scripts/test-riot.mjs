/**
 * Diagnostic: replicate the Cloud Function's Riot calls with the stored key, to see exactly
 * where a "fetch failed" comes from (bad key vs wrong Riot ID vs no ranked games).
 *   node test-riot.mjs               # uses meta/tracked
 *   node test-riot.mjs Name TAG      # test a specific Riot ID
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const AMERICAS = 'https://americas.api.riotgames.com';
const svc = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)));
initializeApp({ credential: cert(svc) });
const db = getFirestore();

const cfg = (await db.doc('config/riot').get()).data() || {};
const key = cfg.apiKey || '';
console.log(
  'config/riot.apiKey:',
  key ? `present (${key.slice(0, 9)}…${key.slice(-4)}, length ${key.length})` : 'MISSING',
);

const tracked = (await db.doc('meta/tracked').get()).data() || {};
const gameName = process.argv[2] || tracked.gameName || 'Drogo400';
const tagLine = (process.argv[3] || tracked.tagLine || 'NA1').replace(/^#/, '');
console.log('Testing player:', `${gameName}#${tagLine}`, '\n');

async function get(url) {
  const res = await fetch(url, { headers: { 'X-Riot-Token': key } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const acct = await get(
  `${AMERICAS}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
);
console.log('Account-V1 →', acct.status, JSON.stringify(acct.body).slice(0, 300));
if (acct.status !== 200) {
  console.log('\n>>> Stops here. 401/403 = key problem; 404 = Riot ID not found.');
  process.exit(0);
}

const puuid = acct.body.puuid;
for (const q of [420, 440]) {
  const ids = await get(
    `${AMERICAS}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${q}&start=0&count=5`,
  );
  console.log(
    `Match ids q${q} →`,
    ids.status,
    Array.isArray(ids.body) ? `${ids.body.length} ids ${JSON.stringify(ids.body.slice(0, 2))}` : JSON.stringify(ids.body).slice(0, 200),
  );
}
console.log('\n>>> If all 200 above, the key + player work — the panel save was the issue (now fixed).');
process.exit(0);
