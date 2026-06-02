/**
 * One-shot migration: stamp `player` onto any ACTIVE game doc that predates the multi-player update
 * (so resolving it targets the correct account, not whatever the default is later changed to).
 * Uses meta/tracked as the source of truth for the legacy player. Idempotent.
 *   node backfill-game-player.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const svc = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)));
initializeApp({ credential: cert(svc) });
const db = getFirestore();

const trackedSnap = await db.doc('meta/tracked').get();
const t = trackedSnap.exists ? trackedSnap.data() : null;
const fallback = {
  gameName: (t && t.gameName) || 'Drogo400',
  tagLine: (t && t.tagLine) || 'NA1',
};

const games = await db.collection('games').where('status', 'in', ['open', 'locked']).get();
let n = 0;
for (const d of games.docs) {
  const g = d.data();
  if (!g.player || !g.player.gameName) {
    await d.ref.set({ player: fallback }, { merge: true });
    console.log(`+ backfilled ${d.id} → ${fallback.gameName}#${fallback.tagLine}`);
    n++;
  } else {
    console.log(`· ${d.id} already has player ${g.player.gameName}#${g.player.tagLine}`);
  }
}
console.log(`Done. Backfilled ${n} active game(s).`);
process.exit(0);
