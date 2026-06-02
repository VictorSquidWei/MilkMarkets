# Milk Market — Task List (`tasks.md`)

> **Status:** PHASE 3 (TASKS). Derived from [`spec.md`](./spec.md) + [`plan.md`](./plan.md).
> Ordered top-to-bottom; check off as completed in PHASE 4. Each task is small enough to verify on its
> own. **Verify** lines say how to confirm it. IDs (US-/AC-/BR-/D-/§) trace back to the contract.
>
> Legend: `[ ]` todo · `[~]` in progress · `[x]` done.

> **PHASE 4 STATUS (implementation):** Areas 0–13 are built and pass offline verification —
> `npm run typecheck` (clean), `npm run build` (succeeds), and **17 unit tests** green
> (LMSR incl. money-pump, PST/DST day logic, resolution accounting). Areas 8/11/13 deploy artifacts
> and Area 14 (live multi-user run) require **your Firebase project + a Riot key** — see Area 14.
> **Deviation disclosed:** resolution accounting was extracted into a pure, tested
> `web/src/lib/settlement.ts` (not in the original list) so OQ-7/OQ-8 logic is unit-verifiable.

---

## Area 0 — Project scaffold & tooling
- [x] **0.1** Create repo layout per plan §3 (`web/`, `functions/`, `scripts/`, `specs/`, root config files). **Verify:** tree matches §3.
- [x] **0.2** Init Vite React-TS app in `web/`; add Tailwind + PostCSS; base Kalshi tokens (colors, radius, tabular-nums) in `tailwind.config.ts` + `index.css`. **Verify:** `npm run dev` renders a styled placeholder; green/red/near-black tokens usable.
- [x] **0.3** Add `react-router-dom` (HashRouter), `firebase`, `lucide-react`; add `vitest`. **Verify:** `npm run build` and `npm run test` run clean on an empty test.
- [x] **0.4** `.gitignore` (node_modules, dist, `serviceAccountKey.json`, `.env*`); root `firebase.json`, `.firebaserc`, empty `firestore.rules`/`firestore.indexes.json`. **Verify:** `git status` shows secrets ignored.

## Area 1 — Constants & Firebase init  (NFR-7)
- [x] **1.1** `web/src/config/constants.ts` exactly per plan §4 (LMSR_B, MIN_BUY, STARTING_BALANCE, SELL_MODE, USERS, TRACKED_PLAYER, RANKED_QUEUES, sample/remake constants, CURRENCY, PACIFIC_TZ, FIREBASE_CONFIG placeholder). **Verify:** typed exports import cleanly; single source for each constant.
- [x] **1.2** `web/src/lib/firebase.ts` — init app, export `auth`, `db`, `functions`. **Verify:** app initializes without throwing against a real project id.

## Area 2 — LMSR engine (pure + unit-tested)  (BR-2..BR-8, §7)
- [x] **2.1** `web/src/lib/lmsr.ts`: `priceYes`, `cost` (log-sum-exp), `buyCost`, `sellProceeds(...,mode)`, `mtm`, `round0_5`. **Verify:** functions are pure (no Firestore).
- [x] **2.2** Vitest suite: 50¢ start; buy-50-YES cost ≈ 27.07 & price ≈ 58.26¢ (§7.6); YES+NO≈100¢ (BR-2); **`'mid'` buy→sell nets +2.06 (pump) while `'lmsr'` nets 0.00** (§7.4); ties/edge inputs. **Verify:** `npm run test` green.

## Area 3 — Auth & onboarding  (US-A1/A2, US-B1, J)
- [x] **3.1** `useAuth` + `AuthProvider` (onAuthStateChanged, persistence); `lib/firebase` login/logout. **Verify:** login persists across reload (AC-A2.1).
- [x] **3.2** `Login` page (email+password only, **no sign-up**, error messaging). **Verify:** bad creds show error; good creds → Home (AC-A1.1/1.2/1.4).
- [x] **3.3** `ProtectedRoute` + `AdminRoute` (reads `useUser().isAdmin`). **Verify:** anon → `/login`; non-admin can't reach `/admin` (AC-A1.3, AC-J1.1).
- [x] **3.4** `HowItWorks` modal: plain-language sections (fake money, YES/NO, 65¢ example, buy/sell, sell-before-lock, min-buy 10, no-void). Auto-open once per uid via localStorage; Nav link. **Verify:** opens on first login, dismiss persists, reopenable (AC-B1.1–1.4).

## Area 4 — Data hooks (live reads)  (live prices)
- [x] **4.1** `useUser` (own `users/{uid}` snapshot), `useAllUsers` (leaderboard), `useMarkets`, `useMarket(id)`, `usePositions(uid)`. **Verify:** editing a doc in console updates UI live (onSnapshot).
- [x] **4.2** `lib/money.ts` (🥛 formatting, cents/% display) + `lib/time.ts` (`dayPST`, `formatPST`, America/Los_Angeles). **Verify:** unit test: a known UTC ts maps to correct PST date across a DST boundary (OQ-9).

## Area 5 — Trading engine (transactions)  (BR-6..BR-11, US-D2/D3, §8)
- [x] **5.1** `lib/trades.ts > buyShares(marketId, side, shares)` transaction: assert open, read user+position, compute via lmsr, write market(lmsr/priceYes/volume/priceHistory≤200/updatedAt), user.balance increment, position increments, trade doc. Typed errors for min-buy/funds. **Verify:** buy moves price up, balance drops by cost, trade row appears; <10 cost rejected; over-balance rejected (AC-D2.2–2.4).
- [x] **5.2** `lib/trades.ts > sellShares(...)` transaction (uses `SELL_MODE`). Reject selling > held. **Verify:** sell returns cash at fair value, position drops; **with default `'lmsr'`, buy-then-full-sell nets ~0** (no pump); over-sell rejected (AC-D3.1–3.4).

## Area 6 — LoL markets & resolution  (US-G1..G3, §9, BR-12..BR-16)
- [x] **6.1** `lib/markets.ts > openGame(lines, baselineMatchId)`: create `games/{id}` + 3 markets (win/kda/cs, status open, b=LMSR_B, price 50¢) in one transaction; block if a non-resolved game exists (OQ-11). **Verify:** 3 cards appear; second open blocked (AC-G1.3/1.5).
- [x] **6.2** `lib/markets.ts > lockGame(gameId)` (3 markets + game → locked). **Verify:** trades rejected on locked markets (AC-G2.1, BR-13).
- [x] **6.3** `lib/markets.ts > resolveGame(gameId, riotResult)`: lock-then-query-then-transaction payout for all 3 from one match; win/kda(>line)/cs(>line); ties→NO; status gate idempotency; update user balance/realized/W-L + positions.settled + game. **Verify:** payouts correct, double-click safe, balances/stats update (AC-G3.2/3.3, BR-12/14, OQ-2/7/8).

## Area 7 — Joe daily market  (US-H1/H2)
- [x] **7.1** `createJoe(text)` — block if a Joe with today's `dayPST` exists (OQ-13); set `dayPST`. **Verify:** one/day enforced; date shown in PST (AC-H1.1–1.3).
- [x] **7.2** `resolveJoe(marketId, outcome)` — lock-then-payout transaction (reuses resolution core). **Verify:** YES/NO resolves & pays; final after (AC-H2.1/2.2).

## Area 8 — Riot Cloud Function (the one function)  (C-4/C-5, US-I1/I2, §10)
- [x] **8.1** `functions/` scaffold (Node 20, `firebase-functions` v2, `firebase-admin`); `riotProxy = onCall`; admin-gate via caller `isAdmin`; read `config/riot` via Admin SDK; placeholder key only. **Verify:** non-admin call → `permission-denied`; missing key → `RIOT_NOT_CONFIGURED`.
- [x] **8.2** `action:'computeLines'`: Account-V1 (cache puuid), Match-V5 ids 420+440 merged/sorted, detail fetch with remake filter + backfill, `round0.5` lines, `baselineMatchId`. **Verify:** against a real key returns plausible lines + sample (OQ-3/4/5).
- [x] **8.3** `action:'resolveLatest'`: newest ranked match strictly newer than baseline; extract win/k/d/a/cs/duration/remake; `{newGame:false}` if none. **Verify:** returns a real recent match; baseline match → newGame:false (OQ-12).
- [x] **8.4** Error mapping: 403→`RIOT_KEY_INVALID`, 429→`RIOT_RATE_LIMITED`; sequential fetch pacing. **Verify:** an expired key yields the typed error; no market writes occur (US-I2/AC-I2.2).
- [x] **8.5** `lib/riot.ts` client wrappers `computeLines()` / `resolveLatest()` mapping errors to the friendly *"update key in admin panel"* message. **Verify:** UI surfaces the message on a bad key.

## Area 9 — Admin panel  (US-G/H/I, J)
- [x] **9.1** `Admin` page shell (AdminRoute-gated) with sections: Riot key · LoL game · Joe. **Verify:** invisible to non-admins (AC-J1.1).
- [x] **9.2** **Update Riot API key** field → writes `config/riot.apiKey`. **Verify:** write succeeds as admin; rules deny non-admin & deny client *read* of config (AC-I1.1–1.4, AC-J2.1).
- [x] **9.3** **Open new game** → `computeLines`, show KDA/CS lines, confirm/cancel → `openGame`. **Verify:** lines previewed before creation (AC-G1.1/1.2).
- [x] **9.4** **Lock** + **Resolve latest** (preview incl. remake/"no new game" warnings) → `resolveGame`. **Verify:** full open→lock→resolve cycle works (US-G2/G3).
- [x] **9.5** **Create Joe** (text) + **Resolve Joe** (YES/NO). **Verify:** create/resolve cycle works (US-H1/H2).

## Area 10 — Frontend pages (Kalshi look)  (NFR-1, US-C/D/E/F)
- [x] **10.1** `ui/` primitives (Button, Card, Badge, Modal, Tabs, PriceTag, NumberInput, Spinner) on the §11 tokens. **Verify:** visual pass: clean, green/red, cents, tabular-nums.
- [x] **10.2** `Home`: cards grouped by category (LoL game + today's Joe), YES/NO cents, status/outcome badges, link to detail. **Verify:** AC-C1.1–1.5.
- [x] **10.3** `MarketDetail`: prices + % caption, `PriceChart` sparkline from `priceHistory`, my position, `TradePanel` (buy/sell, live preview, guards). **Verify:** AC-D1.1/1.2, AC-D2/D3 previews & errors.
- [x] **10.4** `Portfolio`: cash, open positions (shares + MTM), bankroll = cash + ΣMTM. **Verify:** AC-E1.1–1.4.
- [x] **10.5** `Leaderboard`: 11 rows, sortable, current user highlighted; bankroll/MTM via `lib/leaderboard.ts`; realized & W-L from cached fields. **Verify:** AC-F1.1–1.4; numbers match a hand-computed scenario.
- [x] **10.6** `Nav` + responsive pass (laptop + phone). **Verify:** NFR-3 on a narrow viewport.

## Area 11 — Security rules & indexes  (§6, J)
- [x] **11.1** Author `firestore.rules` per §6 (read model, isAdmin-immutable, config read-denied/admin-write, trade-update field allowlist, append-only trades). **Verify:** emulator/console tests: non-admin admin-action denied; config read denied; isAdmin change denied; valid trade allowed (AC-J1.2/1.3, AC-J2.1, AC-J3.1–3.3).
- [x] **11.2** `firestore.indexes.json` per §5; deploy. **Verify:** Home/Joe/portfolio/resolution queries run without "needs index" errors.

## Area 12 — Seed script  (D-5)
- [x] **12.1** `scripts/seed.mjs` (firebase-admin): create 11 `<name>@milkmarket.local` auth users (print temp password), `users/{uid}` docs `{balance:1000, realizedProfit:0, wins:0, losses:0, isAdmin: name==Victor}`. Idempotent. **Verify:** run once → 11 users in Auth + Firestore; Victor isAdmin; re-run skips existing (BR-1, §4).

## Area 13 — Deploy & docs  (D-2/D-4/D-6, §14)
- [x] **13.1** `vite.config.ts` `base` for GH Pages + `.github/workflows/deploy-pages.yml` (build `web/`, publish `dist`); `gh-pages` script fallback. **Verify:** Pages URL loads the app; deep-link refresh works (HashRouter).
- [x] **13.2** Deploy function + rules + indexes (Blaze). **Verify:** callable reachable from the deployed site; rules live.
- [x] **13.3** `README.md`: prereqs, Firebase project setup, function deploy, GH Pages deploy, seed run, **daily Riot-key rotation** (admin-panel paste, no redeploy), placeholder-key note. **Verify:** a fresh follower can stand it up end-to-end.

## Area 14 — End-to-end acceptance pass
- [ ] **14.1** Walk every AC in `spec.md` §7 against the deployed app; fix gaps. **Verify:** all ACs pass. _(Requires your Firebase project + Riot key.)_
- [ ] **14.2** Full live scenario: 2–3 seeded users trade a LoL game (open→lock→resolve) + a Joe market; confirm payouts, portfolio, and leaderboard (bankroll/realized/W-L) all reconcile. **Verify:** numbers tie out; no money pump under default `SELL_MODE='lmsr'`.

---

### Notes for PHASE 4
- After each Area, I'll summarize what was built + how to test it (per the workflow).
- If reality forces a change, I update `spec.md`/`plan.md`/`tasks.md` in the same change — never a
  silent divergence.
- Open dependency on you: confirm **`SELL_MODE`** (plan §0.1) before Area 5; and you'll need to supply
  a real Firebase project (config) + a Riot dev key (entered in-app) for live verification in Areas 8/13.
