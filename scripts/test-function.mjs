/**
 * Diagnostic: call the DEPLOYED riotProxy function end-to-end as an admin (mints an ID token for
 * an admin user), to confirm the whole chain works — admin gate, config read, Riot calls.
 *   node test-function.mjs            # uses meta/tracked
 *   node test-function.mjs Name TAG   # specific Riot ID
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const WEB_API_KEY = 'AIzaSyD5xdn0hv9SoodDcEdED-KCd-wOHHGLThI'; // public web config key
const FN_URL = 'https://us-central1-frog-market-914ff.cloudfunctions.net/riotProxy';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'victor@milkmarket.local';

const svc = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)));
initializeApp({ credential: cert(svc) });
const auth = getAuth();
const db = getFirestore();

const user = await auth.getUserByEmail(ADMIN_EMAIL);
const udoc = (await db.doc(`users/${user.uid}`).get()).data() || {};
console.log(`admin ${ADMIN_EMAIL}: uid ${user.uid}, isAdmin=${udoc.isAdmin}`);

const customToken = await auth.createCustomToken(user.uid);
const ex = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  },
);
const exData = await ex.json();
if (!ex.ok) {
  console.error('token exchange failed:', ex.status, JSON.stringify(exData));
  process.exit(1);
}

const tracked = (await db.doc('meta/tracked').get()).data() || {};
const player = {
  gameName: process.argv[2] || tracked.gameName,
  tagLine: (process.argv[3] || tracked.tagLine || '').replace(/^#/, ''),
};
console.log(`calling computeLines for ${player.gameName}#${player.tagLine} …\n`);

const res = await fetch(FN_URL, {
  method: 'POST',
  headers: { Authorization: `Bearer ${exData.idToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: { action: 'computeLines', player } }),
});
const data = await res.json();
console.log('function HTTP', res.status);
console.log(JSON.stringify(data, null, 2).slice(0, 900));
process.exit(0);
