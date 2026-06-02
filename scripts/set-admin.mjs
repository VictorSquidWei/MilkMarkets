/**
 * Grant (or revoke) admin on existing users by display name or email.
 * Admin = full powers (rotate Riot key, open/lock/resolve/delete markets). isAdmin is
 * client-immutable by the security rules, so this must run server-side via the Admin SDK.
 *
 *   node set-admin.mjs Nick Nate            # grant
 *   node set-admin.mjs Nick --revoke        # revoke
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const revoke = args.includes('--revoke');
const names = args.filter((a) => !a.startsWith('--'));
if (!names.length) {
  console.error('Usage: node set-admin.mjs <Name|email> [...] [--revoke]');
  process.exit(1);
}

const EMAIL_DOMAIN = 'milkmarket.local';
const emailFor = (n) => (n.includes('@') ? n.toLowerCase() : `${n.toLowerCase()}@${EMAIL_DOMAIN}`);

const svc = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)));
initializeApp({ credential: cert(svc) });
const auth = getAuth();
const db = getFirestore();

for (const n of names) {
  const email = emailFor(n);
  try {
    const user = await auth.getUserByEmail(email);
    await db.doc(`users/${user.uid}`).set({ isAdmin: !revoke }, { merge: true });
    console.log(`${revoke ? '− revoked admin from' : '+ granted admin to'} ${email}`);
  } catch (e) {
    console.error(`! ${email}: ${e.message}`);
  }
}
process.exit(0);
