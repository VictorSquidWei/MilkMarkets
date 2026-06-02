/**
 * Milk Market — one-time seed script (spec D-5).
 * Creates the 11 auth users + their users/{uid} docs (balance 1000), sets Victor as admin.
 * Idempotent: skips auth users / docs that already exist (never resets a balance).
 *
 * Usage (from this folder):
 *   1) Put your Firebase service-account JSON here as ./serviceAccountKey.json (git-ignored)
 *   2) npm install
 *   3) [optional] set a password:  $env:SEED_PASSWORD="something"   (PowerShell)
 *      node seed.mjs
 *
 * These constants MIRROR web/src/config/constants.ts — keep them in sync if you edit either.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const USERS = [
  'Jacob', 'Ethan', 'Don', 'Nick', 'Rhett', 'Nate',
  'Victor', 'Joe', 'Philippe', 'Abe', 'Praneeth',
];
const ADMIN_DISPLAY_NAME = 'Victor';
const EMAIL_DOMAIN = 'milkmarket.local';
const STARTING_BALANCE = 1000;
const PASSWORD = process.env.SEED_PASSWORD || 'milkmarket123';

const svc = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)));
initializeApp({ credential: cert(svc) });
const auth = getAuth();
const db = getFirestore();

const emailFor = (name) => `${name.toLowerCase()}@${EMAIL_DOMAIN}`;

for (const name of USERS) {
  const email = emailFor(name);

  // 1) auth user
  let user;
  try {
    user = await auth.getUserByEmail(email);
    console.log(`· auth exists   ${email}`);
  } catch {
    user = await auth.createUser({ email, password: PASSWORD, displayName: name });
    console.log(`+ auth created  ${email}`);
  }

  // 2) firestore doc (create only — never overwrite an existing balance)
  const ref = db.doc(`users/${user.uid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      displayName: name,
      email,
      balance: STARTING_BALANCE,
      isAdmin: name === ADMIN_DISPLAY_NAME,
      realizedProfit: 0,
      wins: 0,
      losses: 0,
      createdAt: Date.now(),
    });
    console.log(`  doc seeded    (${name === ADMIN_DISPLAY_NAME ? 'ADMIN' : 'balance 1000'})`);
  } else {
    console.log(`  doc exists    (left as-is)`);
  }
}

console.log('\nDone. Shared password for all accounts:', PASSWORD);
console.log('Tell each friend their email (e.g. jacob@milkmarket.local) + this password.');
process.exit(0);
