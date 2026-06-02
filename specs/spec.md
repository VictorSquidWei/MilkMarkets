# Milk Market — Specification (`spec.md`)

> **Status:** PHASE 1 (SPEC) — awaiting approval.
> **Document type:** Requirements contract. _What_ the system must do, not _how_. All
> architecture, schema, formulas, and library choices live in `plan.md` (PHASE 2).
> **Source of truth:** the build prompt. Where the prompt was ambiguous, I have **not guessed
> in the requirements** — every ambiguity is listed in [§12 Open Questions](#12-open-questions)
> with a proposed default. Please resolve those before we move to PHASE 2.

---

## 1. Purpose & Vision

Milk Market is a **play-money prediction market** for a private group of **11 friends**. It must
**look and feel like Kalshi** — YES/NO cards, prices in cents (0–100¢) read as crowd probability,
a clean market-detail page, a portfolio, and a leaderboard. All money is fake and exists only for
bragging rights on the leaderboard. The app must be usable by **non-technical** members, so a
plain-language "How it works" intro is a first-class requirement.

Two kinds of markets exist:
1. **League of Legends (LoL) markets** about one tracked player, **Milk Lord#NA1** — three markets
   per game (Win/Loss, KDA Over/Under, CS-per-minute Over/Under).
2. **"Things Joe says"** — one manually-authored, manually-resolved YES/NO market per day.

---

## 2. Background & Environment Constraints

These are environmental facts the requirements must respect (they constrain acceptable solutions;
they are not themselves user stories):

- **C-1** The frontend is **static**, hosted on **GitHub Pages**. No server-side code can run there.
- **C-2** Authentication, persistent data, and the single server function are provided by **Firebase**
  (Auth, Firestore, and one Cloud Function on the Blaze plan).
- **C-3** The Firebase **web config** (apiKey, projectId, etc.) is **safe to commit** publicly.
- **C-4** The **Riot API key is secret** and must **never** reach the browser or the repo. It lives
  only in a **server-only** location and is supplied/rotated by the admin from inside the running app.
- **C-5** Browsers cannot call Riot directly (CORS + secret key), so **all Riot access goes through
  the one Cloud Function proxy**. The Cloud Function does Riot proxying **only** — no money logic.
- **C-6** Riot **dev keys expire every ~24 hours** and have rate limits (~20 req/s, 100 req/2min).
- **C-7** Cheating is explicitly **not a concern**; therefore money logic (buy/sell/resolve) runs
  **client-side**, but must be **atomic** so concurrent trades cannot corrupt market state.
- **C-8** No real Riot key appears anywhere in code or docs — only the placeholder `RGAPI-XXXX...`.

---

## 3. Definitions & Glossary

| Term | Meaning |
|---|---|
| **Player** | A logged-in friend (one of 11). Can browse, trade, and view leaderboard/portfolio. |
| **Admin** | One or more accounts flagged `isAdmin` (Victor, Nick, Nate). Can also act as Players. |
| **Market** | A binary YES/NO question with a price in cents. One of four categories. |
| **YES price** | The market's current cents price for the YES outcome; read as the crowd's % chance of YES. |
| **NO price** | `≈ 100¢ − YES price`. Buying NO is betting against. |
| **Share** | A unit position. A winning share pays exactly **100¢ (1.00 money)** at resolution; a losing share pays 0. |
| **Buy** | Acquiring YES or NO shares. Cost is set by the market mechanism (LMSR) and **moves the price**. |
| **Sell** | Closing shares before resolution at the **current mid price**, with **no fee or spread**. |
| **Cash** | A user's spendable play-money balance. Everyone starts at **1000**. |
| **Mark-to-market (MTM)** | The current value of a user's open shares if marked at present prices. |
| **Bankroll** | Cash **+** MTM of open positions. The leaderboard's headline number. |
| **LoL game** | One tracked ranked match. Produces one fresh **set of 3** LoL markets. |
| **Line** | The Over/Under threshold for KDA or CS/min markets, auto-computed from recent history. |
| **Tracked player** | Riot ID **`Milk Lord#NA1`** (gameName `Milk Lord`, tagLine `NA1`). |
| **Ranked queues** | Ranked Solo (queue `420`) **and** Ranked Flex (queue `440`), combined. |
| **Joe market** | A daily manually-authored, manually-resolved YES/NO question. |
| **Day (PST)** | The "day" boundary used for Joe markets and date display is Pacific Time (see [OQ-9](#oq-9)). |

---

## 4. Actors & Roles

- **Player** — all 11 friends, including me. Default capabilities: log in, read markets/leaderboard,
  trade in open markets, view own portfolio, view onboarding.
- **Admin** — one or more designated accounts (Victor, plus **Nick & Nate** as of post-approval, to
  cover when Victor is away). A superset of Player. Adds: rotate Riot key, open/lock/resolve/**delete**
  LoL games, create/resolve Joe markets, set the tracked player(s). Admin-only actions are gated
  **both** in the UI **and** server-side. Admin is the `isAdmin` flag, which is **client-immutable** and
  granted server-side only (seed or `scripts/set-admin.mjs`).

There is **no self-signup** and **no public/anonymous role** — every actor is a pre-created,
logged-in user.

---

## 5. Trading & Market Business Rules (testable, mechanism-level)

These are the binding behavioral rules the trading engine must satisfy. The _formulas_ that achieve
them belong in `plan.md`; the **observable properties** below are the acceptance surface.

- **BR-1 Starting cash.** Every user begins with exactly **1000** cash.
- **BR-2 Pricing display.** Every open/locked market shows a **YES price** and **NO price** in whole
  cents (0–100¢). YES + NO must display as **100¢ (±1¢ rounding tolerance)**.
- **BR-3 Probability reading.** A price of `P¢` is presented to users as "the group thinks there's a
  **P%** chance."
- **BR-4 Buying moves price.** Buying YES raises the YES price; buying NO raises the NO price
  (lowers YES). Larger buys move price more. (Mechanism: Hanson LMSR, liquidity `b = 150` — a single
  tunable constant; see `plan.md`.)
- **BR-5 Cost preview.** Before confirming a trade, the user sees a preview: how much cash the trade
  costs (or returns), how many shares it involves, and the resulting new price.
- **BR-6 Minimum buy.** A buy is rejected with a friendly message unless it meets the **minimum buy
  of 10 money units** (see [OQ-1](#oq-1) for whether "10" floors cash-spent or is the trade input).
- **BR-7 No maximum buy**, except the user cannot spend more cash than they hold.
- **BR-8 Selling at mid, no fee.** A user may sell shares they hold at the **current mid price**, with
  **no fee or spread**. Any quantity up to the amount held is sellable; there is no minimum sell.
- **BR-9 Sufficient funds / shares.** A buy cannot reduce cash below 0; a sell cannot exceed shares
  held. Violations are rejected with a clear message and **no state change**.
- **BR-10 Atomicity.** Concurrent trades on the same market never corrupt market state or balances;
  each trade either fully applies or fully fails. (Implemented via Firestore transactions.)
- **BR-11 Trade history.** Every executed buy/sell is recorded (who, market, side, action, shares,
  cash amount, price before/after, timestamp).
- **BR-12 Resolution payout.** When a market resolves to an outcome, each **winning** share pays
  exactly **1.00** to its holder and each **losing** share pays **0**; cash balances update atomically.
- **BR-13 Trading windows.** Trading (buy and sell) is allowed only while a market is **open**.
  **Locked** and **resolved** markets reject all trades.
- **BR-14 Finality.** Once resolved, a market is **final** — no void, refund, or re-resolution.
- **BR-15 Money is not conserved.** Total cash across all users may drift away from 11,000 due to
  LMSR; this is expected and acceptable.
- **BR-16 Over/Under semantics.** For KDA and CS/min markets, **YES = the actual value is over the
  line**. Tie handling (actual exactly equals line) is [OQ-2](#oq-2).

---

## 6. Auto-Calculated O/U Lines (testable rules)

- **LN-1 Sole data source.** Lines are computed only from **Riot Match-V5** data via the proxy.
  No scraping of op.gg or any third-party site.
- **LN-2 Sample.** The most recent **10 ranked games** (queues 420 + 440 combined), most recent first.
  Behavior when fewer than 10 exist is [OQ-3](#oq-3); remake/very-short-game handling is [OQ-4](#oq-4).
- **LN-3 KDA per game** = `(kills + assists) / max(1, deaths)`. The **KDA line** = mean of per-game
  KDA over the sample, rounded to the **nearest 0.5** ([OQ-5](#oq-5) confirms 0.5 for KDA).
- **LN-4 CS/min per game** = `(totalMinionsKilled + neutralMinionsKilled) / (gameDuration / 60)`.
  The **CS/min line** = mean over the sample, rounded to the **nearest 0.5**.
- **LN-5 Preview before commit.** When opening a new LoL game, the admin sees the computed KDA and
  CS/min lines **before** the markets are created, and can confirm or cancel.

---

## 7. User Stories & Acceptance Criteria

> Format: `US-x.y` is a story; `AC-x.y.z` are its acceptance criteria (Given/When/Then). All ACs are
> intended to be independently testable.

### A. Authentication & Session

**US-A1 — Log in.** _As a Player, I want to log in with an email and password so that I can access
my account._
- **AC-A1.1** Given a valid pre-created email/password, when I submit the login form, then I am
  authenticated and taken to the Markets home.
- **AC-A1.2** Given invalid credentials, when I submit, then I see a clear error and remain logged out.
- **AC-A1.3** Given I am not logged in, when I navigate to any page other than Login, then I am
  redirected to Login (no app data is shown to anonymous visitors).
- **AC-A1.4** The login screen offers **only** email + password — there is **no sign-up link** and no
  social login.

**US-A2 — Stay logged in / log out.** _As a Player, I want my session to persist and to be able to
log out._
- **AC-A2.1** Given I logged in, when I reload or reopen the app, then I remain logged in until I log out.
- **AC-A2.2** Given I am logged in, when I choose "Log out," then my session ends and I return to Login.

> Note: There is **no in-app password reset** (emails are throwaway/unverified). Resets are handled by
> the admin via the Firebase console — captured in [§10 Out of Scope](#10-out-of-scope).

### B. Onboarding — "How it works"

**US-B1 — Understand the basics.** _As a non-technical Player, I want a short, friendly explanation so
that I understand how the market works before I trade._
- **AC-B1.1** A "How it works" intro is available that explains, in plain language: (a) money is fake
  and for leaderboard bragging rights; (b) what YES/NO means; (c) that **price = the crowd's estimated
  % chance** (with the example "If Win is at 65¢, the group thinks there's a 65% chance he wins. Buy
  YES for 65¢; if he wins it's worth 100¢."); (d) how buying and selling work; (e) that you can sell
  anytime **before a market locks**; (f) that the minimum bet is **10**; (g) that everything is fake.
- **AC-B1.2** The intro also states the **no-void/no-refund** policy in plain words (e.g. "once a
  market is resolved it's final — remakes and do-overs still resolve as-is").
- **AC-B1.3** The intro is **skimmable** (short sections / simple examples), not a wall of text.
- **AC-B1.4** The intro is **always reachable** from the main navigation. (Whether it also auto-opens
  on first login is [OQ-10](#oq-10).)

### C. Markets Home

**US-C1 — Browse markets.** _As a Player, I want to see all current markets grouped clearly so I can
decide what to trade._
- **AC-C1.1** The home page shows market **cards grouped by category**: the current LoL game's three
  markets, and today's Joe market.
- **AC-C1.2** Each card shows the market **title**, the **YES and NO prices in cents**, and its
  **status** (open / locked / resolved).
- **AC-C1.3** **Locked** and **resolved** markets are clearly **badged** and visually distinct from
  open ones; resolved cards show the **outcome** (YES or NO).
- **AC-C1.4** Tapping/clicking a card opens its **Market Detail** page.
- **AC-C1.5** The Kalshi look is honored: clean white/near-black UI, crisp type, **YES = green /
  NO = red**, prices in cents, subtle cards.
- **AC-C1.6** _(Added post-approval)_ The home page **visually separates live markets from history**:
  open/locked markets appear in their category sections at the top; **resolved** markets are grouped
  under a distinct **"History"** section (final, no trading).
- **AC-C1.7** _(Added post-approval)_ A market card the **viewer holds a position in** shows a
  "You hold N YES/NO" indicator (Kalshi-style), flagging it before they open it.
- **AC-C1.8** _(Added post-approval)_ The **History** section is **collapsible and collapsed by
  default**, showing a count; expanding reveals the resolved-market cards.
- **AC-C1.9** _(Added post-approval)_ A **live trade ticker** sits at the top of the home page (above
  Markets): a **vertical, slowly-scrolling** activity feed of recent trades — trader, BUY/SELL, shares
  + side, price, amount, market — color-coded by side, updating live as people trade. Pace stays calm
  regardless of trade count; theme-aware; pauses on hover; respects reduced-motion.
- **AC-C1.10** _(Added post-approval)_ Each market card shows a thin **YES/NO probability bar**
  (analytical, stock-split style).

### D. Market Detail & Trading

**US-D1 — See a market in depth.** _As a Player, I want a detail page with the price and my position._
- **AC-D1.1** The detail page shows the market title, status, current YES/NO prices, a **simple price
  line** (history), and **my current position** in this market (YES shares, NO shares).
- **AC-D1.2** If the market is locked/resolved, trading controls are disabled and a badge explains why.
- **AC-D1.3** _(Added post-approval)_ The price chart is **interactive**: a **labeled Y axis in cents
  (0–100¢)** with gridlines, **time labels on the X axis**, and **hover shows a crosshair + tooltip**
  with the price and time at that point. It adapts to the active theme.
- **AC-D1.4** _(Added post-approval)_ If the viewer holds a position, a prominent **"Your position"**
  banner shows shares held, current mark-to-market value, and **unrealized P&L** (colored).

**US-D2 — Buy YES or NO.** _As a Player, I want to buy shares with a clear cost preview so I can bet._
- **AC-D2.1** Given an **open** market, when I choose a side (YES/NO) and enter a quantity, then I see
  a live preview: "you pay **X** for **N** shares, new price **Y¢**" (exact input unit per [OQ-1](#oq-1)).
- **AC-D2.2** Given my buy does not meet the **minimum of 10**, when I try to confirm, then it is
  rejected with a **friendly message** and no state change.
- **AC-D2.3** Given my buy would cost more cash than I have, when I try to confirm, then it is rejected
  with a clear message and no state change.
- **AC-D2.4** Given a valid buy, when I confirm, then my cash decreases by the cost, my position
  increases by the shares, the market **price moves up** for that side, and a trade record is written —
  all atomically.

**US-D3 — Sell before resolution.** _As a Player, I want to sell shares I hold to lock in value._
- **AC-D3.1** Given I hold shares in an **open** market, when I enter a sell quantity up to my holding,
  then I see proceeds previewed at the **current mid price** (no fee/spread).
- **AC-D3.2** Given I confirm a valid sell, when it executes, then my cash increases by the proceeds,
  my position decreases by the shares sold, and a trade record is written — atomically. (Whether a sell
  moves the price is [OQ-6](#oq-6).)
- **AC-D3.3** Given I try to sell more shares than I hold, then it is rejected with a clear message and
  no state change.
- **AC-D3.4** Given the market is locked/resolved, selling is disabled.

### E. Portfolio

**US-E1 — See my standing.** _As a Player, I want a portfolio view of my cash and positions._
- **AC-E1.1** The portfolio shows my **cash** balance.
- **AC-E1.2** It lists my **open positions**, each with shares held and current **mark-to-market value**.
- **AC-E1.3** It shows my **total bankroll = cash + MTM of open positions**.
- **AC-E1.4** Values update to reflect trades and price movements (on refresh/return at minimum).
- **AC-E1.5** _(Added post-approval)_ Each open position shows the **average price paid** ("Bought X¢" =
  cost basis ÷ shares), the **current price**, and **unrealized P&L**. Visible and theme-aware.

### F. Leaderboard

**US-F1 — Compare with friends.** _As a Player, I want a leaderboard of all 11 users._
- **AC-F1.1** The leaderboard lists **all 11 users** with: **Total bankroll** (cash + MTM of open
  positions), **Realized profit** (settled winnings − settled stakes), and **W/L record** (count of
  resolved markets where the user netted positive vs negative).
- **AC-F1.2** The table is **sortable** by its columns.
- **AC-F1.3** The **current user's row is highlighted**.
- **AC-F1.4** Definitions of Realized profit and W/L (including the break-even case) follow the rules
  fixed in [OQ-7](#oq-7) / [OQ-8](#oq-8).

### G. LoL Market Lifecycle (Admin)

**US-G1 — Open a new LoL game.** _As Admin, I want to open the three markets for a fresh game with
auto-computed lines._
- **AC-G1.1** Given valid Riot config (key + tracked player), when I click **Open new game**, then the
  app fetches the last 10 ranked games via the proxy and computes the **KDA** and **CS/min** lines.
- **AC-G1.2** Before creating anything, I see the **computed lines** and can **confirm or cancel**.
- **AC-G1.3** On confirm, the markets are created — from **Win/Loss**, **KDA O/U (with line)**, **CS/min
  O/U (with line)** — all with status **open**, grouped as one game.
- **AC-G1.3a** _(Added post-approval)_ The admin **selects which of the three** to create (each
  toggleable; at least one required). CS/min is commonly skipped for support/jungle players where
  role-autofill makes CS/min misleading. Lock/resolve/delete operate on whichever markets exist.
- **AC-G1.3b** _(Added post-approval — multi-player)_ Each game is for a specific player whose **Riot ID
  the admin types** when opening (no roster). Up to **3 games run concurrently**, at most **one active
  game per player**. Market titles include the player's name so cards stay unambiguous. Markets home
  shows **one section per active game**, headed by that player's Riot ID; resolve uses that game's player.
- **AC-G1.4** The created markets appear on the Markets home immediately.
- **AC-G1.5** Whether opening a new game is allowed while a prior game is still unresolved is
  [OQ-11](#oq-11).

**US-G2 — Lock / unlock markets.** _As Admin, I want to stop and resume trading per market._
- **AC-G2.1** _(Revised post-approval)_ Each market in a game can be **locked individually** (stops just
  that market's trading) and **unlocked** (resumes it), independently of the others. A **"Lock all"**
  convenience locks every currently-open market of a game at once.
- **AC-G2.2** Locking/unlocking one market doesn't affect the others or the game's lifecycle — the game
  stays active until resolved, and resolution is available regardless of per-market lock state. Locked
  markets stay visible and badged, and reject trades (BR-13).

**US-G3 — Resolve the latest game.** _As Admin, I want to resolve the three markets automatically from
the actual match._
- **AC-G3.1** When I click **Resolve latest**, the app fetches the tracked player's **most recent
  ranked match** via the proxy.
- **AC-G3.2** From that match it determines: **Win/Loss** (did he win), **KDA** (vs the line),
  **CS/min** (vs the line), and resolves all three markets to YES or NO accordingly.
- **AC-G3.3** On resolution, payouts apply per **BR-12** and balances update atomically.
- **AC-G3.4** Guarding against resolving on a **stale/already-counted** match is [OQ-12](#oq-12).
- **AC-G3.5** If Riot returns an auth/rate error (403/429), I see a clear actionable message (see
  [US-H2](#h-riot-key-management-admin)).

### H. Joe Daily Market (Admin)

**US-H1 — Create a Joe market.** _As Admin, I want to type a question, pick its starting price, and open it._
- **AC-H1.1** When I enter question text and create it, a YES/NO Joe market opens with status **open**,
  tagged with **today's date in PST**.
- **AC-H1.2** The new Joe market appears on the Markets home under its category, showing the **PST date**.
- **AC-H1.3** _(Changed post-approval — see [OQ-13](#oq-13))_ **Multiple** Joe markets per PST day are
  allowed; there is no duplicate restriction.
- **AC-H1.4** _(Added post-approval)_ When creating, I set the **starting YES price (1–99¢)**. The
  market opens at that price and **still moves via LMSR** as people trade (BR-4). Default 50¢.

**US-H2 — Resolve Joe market.** _As Admin, I want to manually resolve a Joe market YES or NO._
- **AC-H2.1** When I pick YES or NO and confirm, the market resolves to that outcome and payouts apply
  per **BR-12**.
- **AC-H2.2** A resolved Joe market is final (**BR-14**).

### I. Admin Utilities (Riot Key · Tracked Player · History)

**US-I1 — Rotate the Riot key in-app.** _As Admin, I want to paste a new Riot key daily without a
redeploy._
- **AC-I1.1** The admin panel has an **"Update Riot API key"** field.
- **AC-I1.2** When I submit a key, it is written to a **server-only** location that **clients cannot
  read**; the proxy reads it on each call.
- **AC-I1.3** I can rotate the key any time with **no code change and no redeploy**.
- **AC-I1.4** The key is never exposed to the browser after submission and never appears in the repo
  (placeholder `RGAPI-XXXX...` only).

**US-I2 — Clear errors on key problems.** _As Admin, I want to know when the key is the problem._
- **AC-I2.1** When a Riot call fails with **403** (e.g., expired key) or **429** (rate limit), the app
  surfaces a clear message such as **"Riot key expired or rate-limited — update it in the admin panel."**
- **AC-I2.2** Such failures **never** partially resolve a market or corrupt balances.

**US-I3 — Choose the tracked LoL player.** _(Added post-approval.)_ _As Admin, I want to set which
Riot account the LoL markets follow._
- **AC-I3.1** The admin panel shows the **currently tracked** player and lets me set a new
  **in-game name + tag** (e.g. `Drogo400` / `NA1`).
- **AC-I3.2** After saving, the next **Open new game** fetches that account's games, and the Markets
  home + Win-market title reflect the new name.
- **AC-I3.3** Switching players is **blocked while a LoL game is open or locked** (resolve it first —
  its markets belong to the previous player).
- **AC-I3.4** The tracked name/tag is **non-secret and world-readable** to logged-in users; only the
  admin can change it.

**US-I4 — Delete history markets.** _(Added post-approval.)_ _As Admin, I want to remove old resolved
markets to keep the History list tidy._
- **AC-I4.1** The admin panel lists **resolved** markets/games with a **Delete** action (after a
  confirm). Live (open/locked) markets cannot be deleted.
- **AC-I4.2** Deleting a Joe market removes that market and its bets; deleting a LoL game removes its
  **three markets + the game doc** and their bets.
- **AC-I4.3** Deletion removes the **record only**. It does **not** reverse payouts — settled cash,
  realized profit, and W/L (cached on user docs) are **unchanged** (consistent with no-void, BR-14).

### J. Roles, Access & Security (observable behavior)

**US-J1 — Admin-only controls are hidden and enforced.** _As Admin, I want admin tools restricted to me._
- **AC-J1.1** The **Admin panel** and all admin actions are **not visible** to non-admin Players.
- **AC-J1.2** Even if a non-admin attempts an admin action directly, it is **rejected server-side**
  (security rules), not merely hidden in the UI.
- **AC-J1.3** A user **cannot change their own (or anyone's) `isAdmin` flag**.

**US-J2 — Secret config is unreadable to clients.** 
- **AC-J2.1** The Riot config (key/puuid) is **fully denied** to all client reads and writes; only the
  Cloud Function can read it.

**US-J3 — Appropriate data visibility.** 
- **AC-J3.1** Logged-in users can read **markets** and the **leaderboard-relevant fields** of all users.
- **AC-J3.2** A user can read **their own positions**.
- **AC-J3.3** Trades/positions/balances may be written by clients **only within the atomic trade/resolve
  flows**, and `isAdmin`/secret config remain locked (per US-J1/US-J2).

---

## 8. Non-Functional Requirements

- **NFR-1 Look & feel.** Production-grade, **Kalshi-like** UI (not generic-AI-looking). Clean
  white/near-black, crisp typography, green YES / red NO, cents pricing, subtle cards, simple price
  line on detail pages. (Will consult the `frontend-design` skill in PHASE 4 if available.)
- **NFR-2 Usability.** Operable by non-technical users; key flows (log in, buy, sell, read leaderboard)
  require no explanation beyond the "How it works" intro.
- **NFR-3 Responsiveness.** Works on a normal laptop and a phone browser (it's 11 friends on mixed
  devices). Exact breakpoints TBD in `plan.md`.
- **NFR-4 Performance.** Home, portfolio, and leaderboard render quickly for a group of ~11 and a
  modest number of markets; leaderboard/portfolio rely on cached prices rather than recomputing LMSR
  for every market on every load.
- **NFR-5 Integrity.** All balance-changing operations are atomic (BR-10); a failed/aborted trade
  leaves no partial state.
- **NFR-6 Secrecy.** Riot key never in repo, never in client (C-4/C-8); Firebase web config may be
  committed (C-3).
- **NFR-7 Single-source constants.** Liquidity `b`, minimum buy, the 11 users, and the tracked Riot ID
  are defined in **one easily-editable place** each.
- **NFR-8 Operability.** Admin can run the entire weekly/daily flow (rotate key, open/lock/resolve LoL,
  create/resolve Joe) from the in-app admin panel with no redeploys.
- **NFR-9 Cost.** Stays within Firebase Blaze free-tier-ish usage and Riot dev-key rate limits for a
  group this size.
- **NFR-10 Theme** _(Added post-approval)_. The app supports **light and dark mode** with a toggle in
  the nav, **defaults to the OS preference**, and **persists** the choice. The background uses a
  colorful gradient that adapts per theme; there is no flash of the wrong theme on load.

---

## 9. Deliverables (restated as acceptance targets)

- **D-1** `/specs/spec.md`, `/specs/plan.md`, `/specs/tasks.md` (this SDD set).
- **D-2** React + Vite frontend, deployable to GitHub Pages.
- **D-3** Firestore security rules implementing §7-J.
- **D-4** One Cloud Function (Riot proxy) + deploy notes.
- **D-5** A seed script that creates the 11 auth users with `balance: 1000` and sets my `isAdmin`.
- **D-6** README: prerequisites, Firebase project setup, function deploy, GitHub Pages deploy, running
  the seed script, and **daily Riot-key rotation**.

---

## 10. Out of Scope (v1)

- Self-signup / public registration.
- In-app password reset (admin handles via Firebase console).
- Auto-polling, spectator detection, or live-game tracking — LoL lifecycle is **manual buttons** only.
- Void/refund/re-resolution of any market (BR-14).
- Anti-cheat / money-logic hardening on the server (cheating is out of scope per C-7).
- Markets for any player other than `Milk Lord#NA1`; rolling/standing LoL markets (markets are created
  fresh per game).
- Any data source other than Riot's API for LoL stats.
- Multiple Joe markets per day (one per PST day).
- Mobile native apps (responsive web only).

---

## 11. Traceability Summary

| Prompt requirement | Covered by |
|---|---|
| 11 named users, 1000 start, no self-signup, throwaway emails | §4, BR-1, US-A1, D-5 |
| Admin = me, gated in UI + rules | §4, US-J1 |
| LMSR, b=150, cents, YES+NO≈100 | BR-2..BR-4 |
| Min buy 10, no max, sell at mid no fee | BR-6..BR-8, US-D2/US-D3 |
| Resolution payout 1.00 / 0, transactions | BR-10, BR-12 |
| LoL: 3 markets/game, win/kda/cs, queues 420+440 | §6, US-G1 |
| Auto lines from last 10, rounding | LN-1..LN-5 |
| LoL lifecycle buttons open/lock/resolve | US-G1..US-G3 |
| Joe daily market, PST day, manual resolve | US-H1..US-H2 |
| Riot proxy server-only, key rotation in-app | C-4/C-5, US-I1, AC-J2.1 |
| 429/403 handling | US-I2 |
| Kalshi look, pages, How-it-works | NFR-1, US-C1, US-D1, US-E1, US-F1, US-B1 |
| Static GH Pages + Firebase split | C-1..C-2, D-2 |
| Single-source constants | NFR-7 |

---

## 12. Open Questions

These are the ambiguities I found. Each has a **proposed default** so we can keep moving — please
confirm or correct. I will encode your answers into the spec before PHASE 2.

<a id="oq-1"></a>**OQ-1 — Trade input unit + meaning of "min buy 10."**
The prompt says "Min buy = 10 (in money units)" but the preview reads "you pay X for **N shares**" with
a "quantity input." Is the buy input a **number of shares** (Kalshi-style, app computes cash cost) or a
**cash amount to spend** (app computes shares)?
**Proposed default:** Input is **number of shares** (most Kalshi-like). The "min buy 10" rule means the
**computed cash cost must be ≥ 10**; otherwise the buy is rejected. Sells are also entered in shares.

<a id="oq-2"></a>**OQ-2 — Over/Under tie-breaking.**
If the actual KDA or CS/min **exactly equals** the line, does YES (over) win or NO?
**Proposed default:** **Strictly greater** wins YES; equal-or-below resolves **NO**.

<a id="oq-3"></a>**OQ-3 — Fewer than 10 ranked games in history.**
If the tracked player has fewer than 10 ranked (420/440) games available, what's the line sample?
**Proposed default:** Use **all available** games (≥1). If **zero** ranked games exist, **block**
opening with a clear message.

<a id="oq-4"></a>**OQ-4 — Remakes / very short games in the line sample.**
Remakes (~3 min) would badly skew CS/min and KDA. Exclude them from the last-10 sample?
**Proposed default:** **Exclude games shorter than a threshold (e.g. < 5 minutes / `gameDuration`
below a constant)** from line computation, and pull additional games to backfill toward 10 if needed.
(Resolution of an actual played game still resolves as-is per the no-void policy.)

<a id="oq-5"></a>**OQ-5 — KDA rounding granularity.**
The prompt rounds CS/min to nearest 0.5 and gives "nearest 0.5" only as an *example* for KDA.
**Proposed default:** Round the **KDA line to the nearest 0.5** as well (consistent with CS/min).

<a id="oq-6"></a>**OQ-6 — Does selling move the price?**
"Sell at exactly mid price, no fee/spread" fixes the **proceeds**, but doesn't say whether selling
**reduces the market quantity and therefore moves the price** (standard) or is a **pure cash-out that
leaves the price unchanged**.
**Proposed default:** Selling **reduces the held side's quantity and moves the price** (YES sell lowers
YES price), with proceeds paid at the **mid price at the instant of sale**. This keeps prices coherent.
_(Note: this, like buying, means money is not conserved — consistent with BR-15.)_

<a id="oq-7"></a>**OQ-7 — "Realized profit" definition.**
Define precisely. **Proposed default:** Realized profit = for **resolved** markets only, **(payouts
received at resolution) − (net cash spent acquiring the resolved position)**, where net cash spent =
buys − sell-proceeds on that market. Open positions and pre-resolution sells of still-open markets do
**not** count toward *realized* profit (they're reflected in bankroll/MTM instead). Confirm.

<a id="oq-8"></a>**OQ-8 — W/L record: scope and break-even.**
"Count of resolved markets each user netted positive vs negative." Two sub-questions:
(a) Does a market count toward W/L only if the user **held shares at resolution**, or also if they
traded and fully exited beforehand? (b) How is an exact **break-even (net 0)** counted?
**Proposed default:** (a) A market counts toward W/L only if the user **held a position at resolution**;
fully-exited-before-resolution markets don't count. (b) Net **exactly 0** counts as **neither a win nor
a loss** (shown as 0–0 contribution).

<a id="oq-9"></a>**OQ-9 — "PST" literal vs Pacific Time with DST.**
Today is June 1 — California is on **PDT (UTC-7)**, but "PST" literally means **UTC-8** year-round.
**Proposed default:** Use **America/Los_Angeles (Pacific Time, observes DST)** for the day boundary and
date display — i.e., what people actually mean by "Pacific time." Confirm you don't want a fixed UTC-8.

<a id="oq-10"></a>**OQ-10 — Auto-show the "How it works" intro?**
Should the intro **auto-open on a user's first login** (then be dismissible), or only ever be opened
manually?
**Proposed default:** **Auto-open once on first login**, dismissible, and **always reachable** from the
nav thereafter.

<a id="oq-11"></a>**OQ-11 — Multiple concurrent LoL games?**
Can the admin **Open new game** while a previous game's markets are still open/locked but unresolved?
**Proposed default:** Allow only **one active (open or locked) LoL game at a time** — "Open new game" is
disabled until the current game is **resolved**. (Keeps the home page unambiguous and "Resolve latest"
well-defined.) Confirm, or say you want to allow several at once.

<a id="oq-12"></a>**OQ-12 — Preventing resolution on a stale match.**
"Resolve latest" fetches the **most recent** ranked match. If the player hasn't played a new game since
opening, this could resolve on a match that was already part of the line sample (a "stale" result).
**Proposed default:** At **open time**, record the player's then-most-recent match ID. **Resolve latest**
must use a match that is **strictly newer** than that; if the newest match isn't newer, **block** with
"No new game found since this market opened." Please confirm this guard is wanted.

<a id="oq-13"></a>**OQ-13 — Duplicate Joe market on the same PST day.** _(RESOLVED — changed post-approval.)_
Original default was to block a second Joe market per PST day. **The user changed this: multiple Joe
markets per day are now allowed**, with no duplicate restriction (see AC-H1.3). The admin also sets
each market's **starting YES price (1–99¢)** at creation (AC-H1.4).

<a id="oq-14"></a>**OQ-14 — Currency name & symbol (cosmetic).**
What do we call the play-money unit and how is it shown — plain number, a "🥛 / Milk" label, or "pts"?
**Proposed default:** Display as a plain number labeled **"🥛 Milk"** (e.g., "1,000 🥛"), since the app
is "Milk Market." Purely cosmetic — easy to change.

<a id="oq-15"></a>**OQ-15 — Blaze + Cloud Function vs. an external free worker (the prompt invited this).**
The prompt asked me to flag if an external free worker (e.g., Cloudflare Workers) is *meaningfully*
better for the Riot proxy.
**My recommendation: stay with Blaze + Cloud Function.** Reason: the **key-rotation requirement is the
deciding factor** — the key must live in a **server-only Firestore doc** the admin rewrites from the
app with **no redeploy**, and the proxy reads it **per call**. A Firebase Cloud Function reads that
Firestore doc natively and inherits Firebase Auth context for free. An external worker would either need
a Firebase service-account credential to read the same doc (more setup, another secret to manage) or
store the key in worker secrets (which **breaks** the no-redeploy in-app rotation). So Blaze is both
simpler and a better fit here. **Proceeding with Blaze unless you object.**

---

### ✋ PHASE 1 checkpoint

This is the complete spec. **I'm stopping here and waiting for your approval** before writing
`plan.md`. Please either approve as-is, or give me answers/changes to the 15 open questions above
(several are cosmetic; **OQ-1, OQ-6, OQ-11, and OQ-12** are the ones that most affect the design).
