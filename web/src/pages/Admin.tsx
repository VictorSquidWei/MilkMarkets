import { useState, type ReactNode } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGames } from '../hooks/useGames';
import { useMarkets } from '../hooks/useMarkets';
import { useTracked } from '../hooks/useTracked';
import { computeLines, resolveLatest, RiotError } from '../lib/riot';
import type { ComputeLinesResult, ResolveLatestResult } from '../lib/riot';
import {
  openGame,
  lockGame,
  resolveGame,
  createJoe,
  resolveJoe,
  deleteGameCascade,
  deleteMarketCascade,
} from '../lib/markets';
import { dayPST, formatPSTDate } from '../lib/time';
import { formatCents } from '../lib/money';

const errMsg = (e: unknown) =>
  e instanceof RiotError ? e.message : e instanceof Error ? e.message : 'Something went wrong.';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink/10 bg-paper p-4 shadow-card">
      <h2 className="font-semibold tracking-tight">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const btn =
  'rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink/90 disabled:opacity-40';
const btnGhost =
  'rounded-xl border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:border-ink/40 disabled:opacity-40';

export default function Admin() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <div className="mt-4 space-y-4">
        <RiotKeyCard />
        <TrackedPlayerCard />
        <LolGameCard />
        <JoeCard />
        <HistoryCard />
      </div>
    </div>
  );
}

function RiotKeyCard() {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function save() {
    if (!key.trim()) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await setDoc(doc(db, 'config', 'riot'), { apiKey: key.trim() }, { merge: true });
      setMsg('Saved. The proxy uses the new key on the next fetch — no redeploy needed.');
      setKey('');
    } catch {
      setErr('Could not save the key (admin only).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Riot API key">
      <p className="text-sm text-ink/50">
        Dev keys expire daily. Paste a fresh one here — it’s stored server-side and never shown again.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="RGAPI-XXXX..."
          className="flex-1 rounded-xl border border-ink/15 px-3 py-2 font-mono text-sm outline-none focus:border-ink/40"
        />
        <button className={btn} disabled={busy || !key.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save key'}
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-yes-dark">{msg}</p>}
      {err && <p className="mt-2 text-sm text-no">{err}</p>}
    </Card>
  );
}

function TrackedPlayerCard() {
  const tracked = useTracked();
  const { games } = useGames();
  const activeGame = games.find((g) => g.status !== 'resolved') ?? null;
  const [ign, setIgn] = useState('');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function save() {
    const g = ign.trim();
    const t = tag.trim().replace(/^#/, '');
    if (!g || !t) {
      setErr('Enter both the in-game name and the tag.');
      return;
    }
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await setDoc(doc(db, 'meta', 'tracked'), { gameName: g, tagLine: t }, { merge: true });
      setMsg(`Now tracking ${g}#${t}. The next "Open new game" uses this account.`);
      setIgn('');
      setTag('');
    } catch {
      setErr('Could not save (admin only).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Tracked LoL player">
      <p className="text-sm text-ink/60">
        Currently tracking{' '}
        <b>
          {tracked.gameName}#{tracked.tagLine}
        </b>
        .
      </p>
      {activeGame ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Resolve the current LoL game before switching players — its markets are tied to{' '}
          {tracked.gameName}.
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <input
            value={ign}
            onChange={(e) => setIgn(e.target.value)}
            placeholder={tracked.gameName}
            className="flex-1 rounded-xl border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
          />
          <div className="flex items-center rounded-xl border border-ink/15 px-2 focus-within:border-ink/40">
            <span className="text-sm text-ink/40">#</span>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder={tracked.tagLine}
              className="w-16 py-2 text-sm outline-none"
            />
          </div>
          <button className={btn} disabled={busy || !ign.trim() || !tag.trim()} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-yes-dark">{msg}</p>}
      {err && <p className="mt-2 text-sm text-no">{err}</p>}
    </Card>
  );
}

function LolGameCard() {
  const { games } = useGames();
  const { markets } = useMarkets();
  const active = games.find((g) => g.status !== 'resolved') ?? null;
  const gameMarkets = active ? markets.filter((m) => m.gameId === active.gameId) : [];

  const [lines, setLines] = useState<ComputeLinesResult | null>(null);
  const [resolveInfo, setResolveInfo] = useState<ResolveLatestResult | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const run = async (tag: string, fn: () => Promise<void>) => {
    setBusy(tag);
    setMsg('');
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <Card title="League of Legends game">
      {!active && (
        <>
          {!lines ? (
            <>
              <p className="text-sm text-ink/50">
                Fetches Milk Lord’s last 10 ranked games and computes the KDA & CS/min lines.
              </p>
              <button
                className={`${btn} mt-3`}
                disabled={busy === 'lines'}
                onClick={() => run('lines', async () => setLines(await computeLines()))}
              >
                {busy === 'lines' ? 'Fetching…' : 'Fetch lines for a new game'}
              </button>
            </>
          ) : (
            <div className="rounded-xl bg-ink/[0.03] p-3">
              <p className="text-sm">
                From <b>{lines.sampleSize}</b> ranked games:
              </p>
              <p className="mt-1 text-sm">
                KDA line <b>{lines.kdaLine}</b> · CS/min line <b>{lines.csLine}</b>
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  className={btn}
                  disabled={busy === 'create'}
                  onClick={() =>
                    run('create', async () => {
                      await openGame(
                        { kdaLine: lines.kdaLine, csLine: lines.csLine },
                        lines.baselineMatchId,
                      );
                      setLines(null);
                      setMsg('Game opened — 3 markets are live.');
                    })
                  }
                >
                  {busy === 'create' ? 'Creating…' : 'Create the 3 markets'}
                </button>
                <button className={btnGhost} onClick={() => setLines(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {active && active.status === 'open' && (
        <>
          <p className="text-sm text-ink/60">
            Game open — KDA over <b>{active.kdaLine}</b>, CS/min over <b>{active.csLine}</b>.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {gameMarkets.map((m) => (
              <li key={m.id} className="flex justify-between">
                <span className="text-ink/70">{m.title}</span>
                <span className="tnum">YES {formatCents(m.priceYes)}</span>
              </li>
            ))}
          </ul>
          <button
            className={`${btnGhost} mt-3`}
            disabled={busy === 'lock'}
            onClick={() => run('lock', () => lockGame(active))}
          >
            {busy === 'lock' ? 'Locking…' : 'Lock trading'}
          </button>
        </>
      )}

      {active && active.status === 'locked' && (
        <>
          <p className="text-sm text-ink/60">Game locked. Fetch the result when he’s finished playing.</p>
          {!resolveInfo ? (
            <button
              className={`${btn} mt-3`}
              disabled={busy === 'fetch'}
              onClick={() => run('fetch', async () => setResolveInfo(await resolveLatest(active.baselineMatchId)))}
            >
              {busy === 'fetch' ? 'Fetching…' : 'Fetch latest result'}
            </button>
          ) : !resolveInfo.newGame ? (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              No new game found since this market opened. Wait for him to finish, then fetch again.
              <div className="mt-2">
                <button className={btnGhost} onClick={() => setResolveInfo(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-xl bg-ink/[0.03] p-3 text-sm">
              {resolveInfo.remake && (
                <p className="mb-2 rounded-lg bg-amber-100 px-2 py-1 text-amber-800">
                  ⚠ This looks like a remake/short game ({Math.round((resolveInfo.gameDuration ?? 0) / 60)} min). It
                  will still resolve as-is.
                </p>
              )}
              <Outcome label="Win" value={resolveInfo.win ? 'Won' : 'Lost'} outcome={resolveInfo.win ? 'YES' : 'NO'} />
              <Outcome
                label={`KDA ${resolveInfo.kda?.toFixed(2)} vs ${active.kdaLine}`}
                value={resolveInfo.kda! > active.kdaLine ? 'Over' : 'Under'}
                outcome={resolveInfo.kda! > active.kdaLine ? 'YES' : 'NO'}
              />
              <Outcome
                label={`CS/min ${resolveInfo.csPerMin?.toFixed(2)} vs ${active.csLine}`}
                value={resolveInfo.csPerMin! > active.csLine ? 'Over' : 'Under'}
                outcome={resolveInfo.csPerMin! > active.csLine ? 'YES' : 'NO'}
              />
              <div className="mt-3 flex gap-2">
                <button
                  className={btn}
                  disabled={busy === 'confirm'}
                  onClick={() =>
                    run('confirm', async () => {
                      await resolveGame(active, resolveInfo);
                      setResolveInfo(null);
                      setMsg('Game resolved and payouts applied.');
                    })
                  }
                >
                  {busy === 'confirm' ? 'Resolving…' : 'Confirm & pay out'}
                </button>
                <button className={btnGhost} onClick={() => setResolveInfo(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {msg && <p className="mt-2 text-sm text-yes-dark">{msg}</p>}
      {err && <p className="mt-2 text-sm text-no">{err}</p>}
    </Card>
  );
}

function Outcome({ label, value, outcome }: { label: string; value: string; outcome: 'YES' | 'NO' }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-ink/70">{label}</span>
      <span className={`font-semibold ${outcome === 'YES' ? 'text-yes-dark' : 'text-no-dark'}`}>
        {value} → {outcome}
      </span>
    </div>
  );
}

function HistoryCard() {
  const { games } = useGames();
  const { markets } = useMarkets();
  const resolvedGames = games.filter((g) => g.status === 'resolved');
  const resolvedJoe = markets.filter((m) => m.category === 'joe' && m.status === 'resolved');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const del = async (tag: string, label: string, fn: () => Promise<void>) => {
    if (
      !window.confirm(
        `Delete ${label}? This permanently removes the record. Payouts already made are final and stay.`,
      )
    )
      return;
    setBusy(tag);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  const delBtn =
    'shrink-0 rounded-lg border border-no/40 px-2 py-1 text-xs font-semibold text-no hover:bg-no-soft disabled:opacity-40';

  if (!resolvedGames.length && !resolvedJoe.length) {
    return (
      <Card title="History cleanup">
        <p className="text-sm text-ink/40">No resolved markets to delete yet.</p>
      </Card>
    );
  }

  return (
    <Card title="History cleanup">
      <p className="text-sm text-ink/50">
        Permanently delete old resolved markets to tidy the History list. This removes the record only —
        balances, realized profit, and W–L already settled are <b>not</b> changed.
      </p>

      {resolvedGames.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-medium uppercase tracking-wide text-ink/40">
            Resolved LoL games
          </div>
          <ul className="mt-1 space-y-1">
            {resolvedGames.map((g) => (
              <li key={g.gameId} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink/70">
                  Game · KDA {g.kdaLine} / CS {g.csLine}
                  {g.resolvedAt ? ` · ${formatPSTDate(g.resolvedAt)}` : ''}
                </span>
                <button
                  className={delBtn}
                  disabled={busy === g.gameId}
                  onClick={() =>
                    del(g.gameId, 'this LoL game and its 3 markets', () => deleteGameCascade(g))
                  }
                >
                  {busy === g.gameId ? 'Deleting…' : 'Delete'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resolvedJoe.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-medium uppercase tracking-wide text-ink/40">
            Resolved Joe markets
          </div>
          <ul className="mt-1 space-y-1">
            {resolvedJoe.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink/70">
                  {m.title}{' '}
                  <span className={m.outcome === 'YES' ? 'text-yes-dark' : 'text-no-dark'}>
                    · {m.outcome}
                  </span>
                </span>
                <button
                  className={delBtn}
                  disabled={busy === m.id}
                  onClick={() => del(m.id, `"${m.title}"`, () => deleteMarketCascade(m.id))}
                >
                  {busy === m.id ? 'Deleting…' : 'Delete'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-no">{err}</p>}
    </Card>
  );
}

function JoeCard() {
  const { markets } = useMarkets();
  const open = markets.filter((m) => m.category === 'joe' && m.status !== 'resolved');
  const [text, setText] = useState('');
  const [priceStr, setPriceStr] = useState('50');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const price = Number(priceStr);
  const priceValid = Number.isFinite(price) && price >= 1 && price <= 99;

  const run = async (tag: string, fn: () => Promise<void>) => {
    setBusy(tag);
    setMsg('');
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <Card title={`Things Joe Says — ${formatPSTDate(Date.now())} (PST)`}>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Will Joe say “it is what it is” today?"
          className="flex-1 rounded-xl border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
        />
        <div className="flex items-center rounded-xl border border-ink/15 px-2 focus-within:border-ink/40">
          <input
            type="number"
            min={1}
            max={99}
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            title="Starting YES price"
            className="tnum w-12 py-2 text-right text-sm outline-none"
          />
          <span className="pl-1 text-sm text-ink/40">¢</span>
        </div>
        <button
          className={btn}
          disabled={busy === 'create' || !text.trim() || !priceValid}
          onClick={() =>
            run('create', async () => {
              await createJoe(text, price);
              setText('');
              setMsg('Joe market opened.');
            })
          }
        >
          {busy === 'create' ? 'Opening…' : 'Open'}
        </button>
      </div>
      <p className="mt-1 text-xs text-ink/40">
        Starts at {priceValid ? price : 50}¢ YES, then moves as people trade. Open as many as you like
        per day (today: {dayPST()} PST).
      </p>

      {open.length > 0 && (
        <ul className="mt-3 space-y-2">
          {open.map((m) => (
            <li key={m.id} className="rounded-xl border border-ink/10 p-3">
              <div className="text-sm font-medium">{m.title}</div>
              <div className="mt-2 flex gap-2">
                <button
                  className="flex-1 rounded-lg bg-yes py-1.5 text-sm font-semibold text-white hover:bg-yes-dark disabled:opacity-40"
                  disabled={busy === m.id}
                  onClick={() => run(m.id, () => resolveJoe(m.id, 'YES'))}
                >
                  Resolve YES
                </button>
                <button
                  className="flex-1 rounded-lg bg-no py-1.5 text-sm font-semibold text-white hover:bg-no-dark disabled:opacity-40"
                  disabled={busy === m.id}
                  onClick={() => run(m.id, () => resolveJoe(m.id, 'NO'))}
                >
                  Resolve NO
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-2 text-sm text-yes-dark">{msg}</p>}
      {err && <p className="mt-2 text-sm text-no">{err}</p>}
    </Card>
  );
}
