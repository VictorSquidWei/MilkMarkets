# 🥛 Milk Market

A play-money, Kalshi-style prediction market for 11 friends. Bet YES/NO on League of Legends games
for a **tracked Riot account** (currently **Drogo400#NA1**, editable anytime in **Admin → Tracked LoL
player**) and a daily **"Things Joe Says"** question. All money is fake — it's for leaderboard
bragging rights.

- **Frontend:** React + Vite + Tailwind, static, hosted on **GitHub Pages**.
- **Backend:** Firebase **Auth** + **Firestore** + **one Cloud Function** (a Riot API proxy — the only
  server code; it does *no* money logic).
- **Market mechanism:** Hanson **LMSR** (`b = 150`), prices in cents, YES + NO ≈ 100¢.

> Full requirements/design/tasks live in [`specs/`](./specs). Read those first if you're changing
> behavior — they're the contract.

---

## Repository layout

```
web/         React + Vite SPA (deploys to GitHub Pages)
functions/   the single Cloud Function: Riot proxy (riotProxy)
scripts/     one-time seed script (create 11 users)
specs/       spec.md · plan.md · tasks.md (the SDD docs)
firestore.rules / firestore.indexes.json / firebase.json
```

---

## Key facts before you start

- The Firebase **web config** in [`web/src/config/constants.ts`](web/src/config/constants.ts) is **safe
  to commit**.
- The **Riot API key is secret** and is **never** in the repo or the browser. It lives only in the
  server-only Firestore doc `config/riot`, written from the in-app **Admin panel**, and is read by the
  Cloud Function. Code/docs only ever show the placeholder `RGAPI-XXXX...`.
- Tunable constants (LMSR `b`, min buy, the 11 names, the tracked Riot ID, **`SELL_MODE`**) all live in
  one file: `web/src/config/constants.ts`.
- **`SELL_MODE` defaults to `'lmsr'`** (fee-free, no risk-free money pump). See
  [`specs/plan.md` §0.1](specs/plan.md) before changing it to `'mid'`.

---

## 1) Prerequisites

- Node 20+, npm.
- A Firebase project on the **Blaze** plan (required for the function's outbound Riot calls).
- The Firebase CLI: `npm i -g firebase-tools` then `firebase login`.
- A Riot **developer API key** (https://developer.riotgames.com) — entered later in the app, not here.

## 2) Create & configure the Firebase project

1. Create a project in the [Firebase console](https://console.firebase.google.com); enable
   **Authentication → Email/Password** and **Firestore** (production mode).
2. Add a **Web app**; copy its config into `web/src/config/constants.ts` (`FIREBASE_CONFIG`).
3. Put your project id in [`.firebaserc`](.firebaserc) (replace `milk-market-REPLACE-ME`).
4. Upgrade the project to **Blaze**.

## 3) Deploy Firestore rules, indexes, and the function

```bash
cd functions && npm install && cd ..
firebase deploy --only firestore:rules,firestore:indexes,functions
```

This publishes [`firestore.rules`](firestore.rules), the composite index, and the `riotProxy`
function. (The first composite-index build can take a couple of minutes.)

## 4) Seed the 11 users (run once)

1. In the Firebase console: **Project settings → Service accounts → Generate new private key**.
2. Save it as `scripts/serviceAccountKey.json` (this path is git-ignored).
3. Run:

```bash
cd scripts
npm install
# optional: set a shared password (PowerShell) — otherwise it's "milkmarket123"
#   $env:SEED_PASSWORD="pick-something"
npm run seed
```

Creates `jacob@milkmarket.local` … `praneeth@milkmarket.local`, each with **balance 1000**, and sets
**Victor** as the admin (`isAdmin: true`). Re-running skips anyone who already exists (it won't reset
balances). Share each friend's email + the password.

## 5) Deploy the frontend to GitHub Pages

**Option A — GitHub Actions (recommended):** push to `main`. The workflow in
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) builds `web/` with the
correct base path and publishes to Pages. Enable it once via **Repo → Settings → Pages → Build and
deployment → Source: GitHub Actions**.

**Option B — manual:**

```bash
cd web && npm install
# base must match how Pages serves the site:
#   project page:  /<repo-name>/    ·    user/org page or custom domain:  /
VITE_BASE=/<repo-name>/ npm run build
npx gh-pages -d dist     # or: npm run deploy
```

Routing uses `HashRouter`, so deep links and refreshes work on Pages without extra config.

## 6) First run in the app

1. Open the Pages URL and log in as **Victor**.
2. Go to **Admin → Riot API key**, paste a fresh `RGAPI-...` key, **Save**.
3. **Admin → League of Legends game → Fetch lines for a new game** → review the auto KDA/CS lines →
   **Create the 3 markets**.
4. **Admin → Things Joe Says** → type today's question → **Open**.
5. Friends log in and trade. Sell anytime before a market locks. Min buy is 10 🥛.

---

## 🔑 Daily chore: rotate the Riot key

Riot **dev keys expire every ~24h.** Each day:

1. Get a fresh key at https://developer.riotgames.com.
2. App → **Admin → Riot API key** → paste → **Save**.

That's it — it writes `config/riot.apiKey`; the function picks it up on the next call. **No redeploy.**
If a fetch fails with *"Riot key expired or rate-limited"*, the key is the likely cause — rotate it.

---

## Game lifecycle (admin)

- **Open new game** → auto-computes KDA & CS/min lines from the last 10 ranked games (queues 420+440,
  remakes excluded) and opens Win/KDA/CS markets.
- **Lock** → stops trading.
- **Fetch latest result → Confirm** → resolves all three from his most recent ranked match (must be
  newer than when the game opened). Winning shares pay 100¢.
- One active LoL game at a time; one Joe market per PST day. Resolutions are **final** (no refunds).

## Local development

```bash
cd web && npm install
npm run dev        # local SPA (talks to your live Firebase project)
npm test           # LMSR + time unit tests
npm run typecheck
```

## Notes

- LMSR doesn't conserve money — total bankroll drifts from 11,000. Expected.
- "Day" boundaries and dates use **America/Los_Angeles** (Pacific, observes DST).
- Cheating isn't a concern, so money logic runs client-side in Firestore transactions; the rules lock
  down `isAdmin` and the secret `config/*` but intentionally allow ordinary trade writes (see
  [`specs/plan.md` §6](specs/plan.md)).
