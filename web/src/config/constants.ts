// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for tunable constants (spec NFR-7).
// Edit values here; nothing below should be hard-coded elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

// ——— Firebase WEB config (SAFE to commit publicly — see spec C-3) ———
// Replace with your project's values from the Firebase console.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD5xdn0hv9SoodDcEdED-KCd-wOHHGLThI',
  authDomain: 'frog-market-914ff.firebaseapp.com',
  projectId: 'frog-market-914ff',
  storageBucket: 'frog-market-914ff.firebasestorage.app',
  messagingSenderId: '30427953373',
  appId: '1:30427953373:web:15fc40e546a87158a20334',
};

// ——— Economy / market mechanism ———
export const LMSR_B = 150; // LMSR liquidity. The ONLY place b is defined (spec BR-4).
export const MIN_BUY = 10; // minimum CASH cost of a buy in 🥛 (spec BR-6 / OQ-1).
export const STARTING_BALANCE = 1000; // every user starts here (spec BR-1).

// Sell pricing mode (see specs/plan.md §0.1 & §7.4):
//   'lmsr' — fee-free fair-value sell; ≈ mid for small sells; NO money pump. (recommended)
//   'mid'  — literal "shares × current mid"; enables a risk-free buy→sell pump.
export const SELL_MODE: 'lmsr' | 'mid' = 'lmsr';

// ——— People (the 11 friends; display names) ———
export const USERS = [
  'Jacob',
  'Ethan',
  'Don',
  'Nick',
  'Rhett',
  'Nate',
  'Victor',
  'Joe',
  'Philippe',
  'Abe',
  'Praneeth',
] as const;
export type DisplayName = (typeof USERS)[number];

export const EMAIL_DOMAIN = 'milkmarket.local'; // throwaway emails (spec identity)
export const ADMIN_DISPLAY_NAME: DisplayName = 'Victor'; // gets isAdmin via the seed script
export const JOE_DISPLAY_NAME: DisplayName = 'Joe'; // can't see/bet "Things Joe Says" (fairness)

/** Deterministic throwaway email for a display name, e.g. "Jacob" -> "jacob@milkmarket.local". */
export const emailFor = (displayName: string): string =>
  `${displayName.toLowerCase()}@${EMAIL_DOMAIN}`;

// ——— LoL / Riot (tracked player + line rules) ———
// Default tracked player. This is now editable at runtime from the Admin panel (writes the
// client-readable `meta/tracked` doc); this constant is only the fallback / initial default.
export const TRACKED_PLAYER = { gameName: 'Drogo400', tagLine: 'NA1' } as const;
export const RANKED_QUEUES = [420, 440] as const; // ranked solo + flex
export const LINE_SAMPLE_SIZE = 10; // last N ranked games for O/U lines (spec LN-2)
export const MIN_GAME_SECONDS = 300; // exclude remakes/very short games from line sample (OQ-4)

// ——— Presentation ———
export const CURRENCY = { symbol: '🥛', name: 'Milk', minorPlaces: 2 } as const;
export const PACIFIC_TZ = 'America/Los_Angeles'; // PST/PDT day boundary + display (OQ-9)
