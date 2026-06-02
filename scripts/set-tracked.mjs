/**
 * Set the tracked LoL player (writes the client-readable meta/tracked doc).
 * Day-to-day you'll use the Admin panel "Tracked LoL player" card — this is for setup/CLI.
 *   node set-tracked.mjs <gameName> <tagLine>
 *   e.g. node set-tracked.mjs Drogo400 NA1
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const gameName = process.argv[2];
const tagLine = (process.argv[3] || '').replace(/^#/, '');
if (!gameName || !tagLine) {
  console.error('Usage: node set-tracked.mjs <gameName> <tagLine>   e.g. node set-tracked.mjs Drogo400 NA1');
  process.exit(1);
}

const svc = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)));
initializeApp({ credential: cert(svc) });
const db = getFirestore();

await db.doc('meta/tracked').set({ gameName, tagLine }, { merge: true });
console.log(`Now tracking ${gameName}#${tagLine}.`);
process.exit(0);
