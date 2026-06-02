/**
 * Deploy firestore.rules via the Firebase Rules REST API using the service account.
 * Avoids the firebase CLI's serviceusage pre-check (which the limited SA can't pass).
 *   node deploy-rules.mjs
 */
import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const PROJECT = 'frog-market-914ff';
const svc = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)));
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const auth = new GoogleAuth({
  credentials: svc,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const token = (await client.getAccessToken()).token;
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const base = 'https://firebaserules.googleapis.com/v1';

// 1) create a ruleset
const rsRes = await fetch(`${base}/projects/${PROJECT}/rulesets`, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rules }] } }),
});
const rsData = await rsRes.json();
if (!rsRes.ok) {
  console.error('Ruleset create failed:', rsRes.status, JSON.stringify(rsData, null, 2));
  process.exit(1);
}
console.log('Created ruleset:', rsData.name);

// 2) point the cloud.firestore release at it (create, or update if it already exists)
const relName = `projects/${PROJECT}/releases/cloud.firestore`;
let relRes = await fetch(`${base}/projects/${PROJECT}/releases`, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ name: relName, rulesetName: rsData.name }),
});
if (relRes.status === 409) {
  relRes = await fetch(`${base}/${relName}?updateMask=rulesetName`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ name: relName, rulesetName: rsData.name }),
  });
}
const relData = await relRes.json();
if (!relRes.ok) {
  console.error('Release update failed:', relRes.status, JSON.stringify(relData, null, 2));
  process.exit(1);
}
console.log('Released rules to cloud.firestore ✓');
process.exit(0);
