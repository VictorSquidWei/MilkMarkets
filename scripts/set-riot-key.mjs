/**
 * Convenience: write a Riot API key into the server-only `config/riot` doc via the Admin SDK.
 * Day-to-day you'll just use the in-app Admin panel (no script needed) — this is for the first load.
 *
 * Usage:  node set-riot-key.mjs RGAPI-xxxxxxxx-....
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const key = process.argv[2] || process.env.RIOT_KEY;
if (!key) {
  console.error('Usage: node set-riot-key.mjs <RGAPI-...>');
  process.exit(1);
}

const svc = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)));
initializeApp({ credential: cert(svc) });
const db = getFirestore();

await db.doc('config/riot').set({ apiKey: key }, { merge: true });
console.log('config/riot updated. The Cloud Function will use this key on the next fetch.');
console.log('(The tracked player lives in meta/tracked — set it with set-tracked.mjs or the Admin panel.)');
process.exit(0);
