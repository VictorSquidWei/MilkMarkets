/**
 * Grant the default compute service account the Cloud Build Builder role, so 2nd-gen
 * Cloud Functions can build. Uses the logged-in Firebase CLI token (cloud-platform scope).
 * Safe read-modify-write of the project IAM policy (preserves all existing bindings + etag).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT = 'frog-market-914ff';
const PROJECT_NUMBER = '30427953373';
const MEMBER = `serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com`;
const ROLES = ['roles/cloudbuild.builds.builder'];

const cfgPath = join(
  process.env.USERPROFILE || process.env.HOME,
  '.config',
  'configstore',
  'firebase-tools.json',
);
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const t = cfg.tokens || {};
let accessToken = t.access_token;

if (!accessToken || !t.expires_at || Date.now() > t.expires_at - 60_000) {
  if (!t.refresh_token) {
    console.error('No usable token. Run `firebase login` again, then re-run this.');
    process.exit(1);
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: t.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!r.ok) {
    console.error('Token refresh failed:', r.status, JSON.stringify(d));
    process.exit(1);
  }
  accessToken = d.access_token;
  console.log('Refreshed access token.');
} else {
  console.log('Using existing valid CLI token.');
}

const H = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
const CRM = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`;

const gr = await fetch(`${CRM}:getIamPolicy`, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ options: { requestedPolicyVersion: 1 } }),
});
const policy = await gr.json();
if (!gr.ok) {
  console.error('getIamPolicy failed:', gr.status, JSON.stringify(policy));
  process.exit(1);
}
policy.bindings = policy.bindings || [];
console.log(`Current policy has ${policy.bindings.length} bindings.`);

let changed = false;
for (const role of ROLES) {
  let b = policy.bindings.find((x) => x.role === role && !x.condition);
  if (!b) {
    b = { role, members: [] };
    policy.bindings.push(b);
  }
  b.members = b.members || [];
  if (!b.members.includes(MEMBER)) {
    b.members.push(MEMBER);
    changed = true;
    console.log(`+ adding ${MEMBER} -> ${role}`);
  } else {
    console.log(`= already has ${role}`);
  }
}

if (!changed) {
  console.log('No change needed.');
  process.exit(0);
}

const sr = await fetch(`${CRM}:setIamPolicy`, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ policy }),
});
const sd = await sr.json();
if (!sr.ok) {
  console.error('setIamPolicy failed:', sr.status, JSON.stringify(sd));
  process.exit(1);
}
console.log('IAM updated ✓ build SA now has cloudbuild.builds.builder.');
process.exit(0);
