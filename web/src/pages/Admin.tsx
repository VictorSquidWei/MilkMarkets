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
  lockMarket,
  unlockMarket,
  resolveGame,
  createJoe,
  resolveJoe,
  createFutures,
  resolveFutures,
  deleteGameCascade,
  deleteMarketCascade,
  MAX_ACTIVE_GAMES,
} from '../lib/markets';
import type { Game, Market } from '../lib/types';
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
        <LolGameCard />
        <FuturesCard />
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

function MarketToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition ${
        checked ? 'border-ink bg-ink/[0.04] font-medium text-ink' : 'border-ink/15 text-ink/45'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-ink"
      />
      {label}
    </label>
  );
}

const MARKET_RANK: Record<string, number> = { lol_win: 0, lol_kda: 1, lol_cs: 2, joe: 3 };

function LolGameCard() {
  const { games } = useGames();
  const { markets } = useMarkets();
  const activeGames = games.filter((g) => g.status !== 'resolved'); // newest-first
  const canOpen = activeGames.length < MAX_ACTIVE_GAMES;

  return (
    <Card title="League of Legends games">
      <p className="text-sm text-ink/50">
        {activeGames.length}/{MAX_ACTIVE_GAMES} games active. Type a player’s Riot ID to open a new one.
      </p>

      {canOpen ? (
        <OpenGameForm />
      ) : (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
          Max {MAX_ACTIVE_GAMES} games running — resolve one to open another.
        </p>
      )}

      {activeGames.length > 0 && (
        <div className="mt-4 space-y-3">
          {activeGames.map((g) => (
            <ActiveGameRow
              key={g.gameId}
              game={g}
              markets={markets
                .filter((m) => m.gameId === g.gameId)
                .sort((a, b) => MARKET_RANK[a.category] - MARKET_RANK[b.category])}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function OpenGameForm() {
  const tracked = useTracked();
  const [ign, setIgn] = useState('');
  const [tag, setTag] = useState('');
  const [lines, setLines] = useState<ComputeLinesResult | null>(null);
  const [sel, setSel] = useState({ win: true, kda: true, cs: true });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const run = async (tagName: string, fn: () => Promise<void>) => {
    setBusy(tagName);
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

  const player = { gameName: ign.trim(), tagLine: tag.trim().replace(/^#/, '') };
  const hasId = !!player.gameName && !!player.tagLine;
  const reset = () => {
    setLines(null);
    setSel({ win: true, kda: true, cs: true });
  };

  return (
    <div className="mt-3 rounded-xl border border-ink/10 p-3">
      {!lines ? (
        <>
          <div className="flex gap-2">
            <input
              value={ign}
              onChange={(e) => setIgn(e.target.value)}
              placeholder={`Riot name (e.g. ${tracked.gameName})`}
              className="min-w-0 flex-1 rounded-xl border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
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
            <button
              className={btn}
              disabled={busy === 'lines' || !hasId}
              onClick={() => run('lines', async () => setLines(await computeLines(player)))}
            >
              {busy === 'lines' ? 'Fetching…' : 'Fetch lines'}
            </button>
          </div>
          <p className="mt-1 text-xs text-ink/45">Enter the Riot ID of the player for this game.</p>
        </>
      ) : (
        <>
          <p className="text-sm">
            <b>
              {player.gameName}#{player.tagLine}
            </b>{' '}
            · from <b>{lines.sampleSize}</b> games · KDA <b>{lines.kdaLine}</b> · CS/min{' '}
            <b>{lines.csLine}</b>
          </p>
          <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink/45">
              Markets to create
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <MarketToggle label="Win / Loss" checked={sel.win} onChange={(v) => setSel((s) => ({ ...s, win: v }))} />
              <MarketToggle label={`KDA o/u ${lines.kdaLine}`} checked={sel.kda} onChange={(v) => setSel((s) => ({ ...s, kda: v }))} />
              <MarketToggle label={`CS/min o/u ${lines.csLine}`} checked={sel.cs} onChange={(v) => setSel((s) => ({ ...s, cs: v }))} />
            </div>
            <p className="mt-1.5 text-xs text-ink/45">
              Tip: skip CS/min for supports & junglers — role autofill makes it misleading.
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className={btn}
              disabled={busy === 'create' || (!sel.win && !sel.kda && !sel.cs)}
              onClick={() =>
                run('create', async () => {
                  const count = [sel.win, sel.kda, sel.cs].filter(Boolean).length;
                  await openGame(player, { kdaLine: lines.kdaLine, csLine: lines.csLine }, lines.baselineMatchId, sel);
                  setIgn('');
                  setTag('');
                  reset();
                  setMsg(`Opened ${player.gameName} — ${count} market${count > 1 ? 's' : ''} live.`);
                })
              }
            >
              {busy === 'create' ? 'Creating…' : 'Create markets'}
            </button>
            <button className={btnGhost} onClick={reset}>
              Cancel
            </button>
          </div>
        </>
      )}
      {msg && <p className="mt-2 text-sm text-yes-dark">{msg}</p>}
      {err && <p className="mt-2 text-sm text-no">{err}</p>}
    </div>
  );
}

function ActiveGameRow({ game, markets }: { game: Game; markets: Market[] }) {
  const [resolveInfo, setResolveInfo] = useState<ResolveLatestResult | null>(null);
  const [busy, setBusy] = useState('');
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

  const label = game.player ? `${game.player.gameName}#${game.player.tagLine}` : 'Tracked player';
  const anyOpen = markets.some((m) => m.status === 'open');

  return (
    <div className="rounded-xl border border-ink/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate font-semibold">{label}</div>
        {anyOpen ? (
          <button
            className="shrink-0 rounded-lg border border-ink/15 px-2 py-1 text-xs font-semibold text-ink/70 hover:border-ink/40 disabled:opacity-40"
            disabled={busy === 'lockall'}
            onClick={() => run('lockall', () => lockGame(game))}
          >
            {busy === 'lockall' ? 'Locking…' : 'Lock all'}
          </button>
        ) : (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            All locked
          </span>
        )}
      </div>

      <ul className="mt-2 space-y-1.5 text-sm">
        {markets.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-ink/70">{m.title}</span>
            <span className="tnum shrink-0 text-ink/45">{formatCents(m.priceYes)}</span>
            {m.status === 'locked' && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                Locked
              </span>
            )}
            {m.status !== 'resolved' && (
              <button
                className="shrink-0 rounded-lg border border-ink/15 px-2 py-0.5 text-xs font-semibold text-ink/70 hover:border-ink/40 disabled:opacity-40"
                disabled={busy === `m_${m.id}`}
                onClick={() =>
                  run(`m_${m.id}`, () => (m.status === 'open' ? lockMarket(m.id) : unlockMarket(m.id)))
                }
              >
                {busy === `m_${m.id}` ? '…' : m.status === 'open' ? 'Lock' : 'Unlock'}
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 border-t border-ink/[0.06] pt-3">
        {!resolveInfo ? (
          <button
            className={btn}
            disabled={busy === 'fetch'}
            onClick={() => run('fetch', async () => setResolveInfo(await resolveLatest(game.player, game.baselineMatchId)))}
          >
            {busy === 'fetch' ? 'Fetching…' : 'Fetch result & resolve'}
          </button>
        ) : !resolveInfo.newGame ? (
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
            No new game found since this market opened. Wait for the game to finish, then fetch again.
            <div className="mt-2">
              <button className={btnGhost} onClick={() => setResolveInfo(null)}>
                Dismiss
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-ink/[0.03] p-3 text-sm">
            {resolveInfo.remake && (
              <p className="mb-2 rounded-lg bg-amber-100 px-2 py-1 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                ⚠ Looks like a remake/short game ({Math.round((resolveInfo.gameDuration ?? 0) / 60)} min). It
                will still resolve as-is.
              </p>
            )}
            {game.marketIds.win && (
              <Outcome label="Win" value={resolveInfo.win ? 'Won' : 'Lost'} outcome={resolveInfo.win ? 'YES' : 'NO'} />
            )}
            {game.marketIds.kda && (
              <Outcome
                label={`KDA ${resolveInfo.kda?.toFixed(2)} vs ${game.kdaLine}`}
                value={resolveInfo.kda! > game.kdaLine ? 'Over' : 'Under'}
                outcome={resolveInfo.kda! > game.kdaLine ? 'YES' : 'NO'}
              />
            )}
            {game.marketIds.cs && (
              <Outcome
                label={`CS/min ${resolveInfo.csPerMin?.toFixed(2)} vs ${game.csLine}`}
                value={resolveInfo.csPerMin! > game.csLine ? 'Over' : 'Under'}
                outcome={resolveInfo.csPerMin! > game.csLine ? 'YES' : 'NO'}
              />
            )}
            <div className="mt-3 flex gap-2">
              <button
                className={btn}
                disabled={busy === 'confirm'}
                onClick={() =>
                  run('confirm', async () => {
                    await resolveGame(game, resolveInfo);
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
      </div>

      {msg && <p className="mt-2 text-sm text-yes-dark">{msg}</p>}
      {err && <p className="mt-2 text-sm text-no">{err}</p>}
    </div>
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

function FuturesCard() {
  const { markets } = useMarkets();
  const open = markets.filter((m) => m.category === 'futures' && m.status !== 'resolved');
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
    <Card title="Futures">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Any yes/no question, e.g. “Will it snow on Christmas?”"
          className="flex-1 rounded-xl border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
        />
        <div className="flex items-center rounded-xl border border-ink/15 px-2 focus-within:border-ink/40">
          <input
            type="number"
            min={1}
            max={99}
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            title="Starting (fair) YES price"
            className="tnum w-12 py-2 text-right text-sm outline-none"
          />
          <span className="pl-1 text-sm text-ink/40">¢</span>
        </div>
        <button
          className={btn}
          disabled={busy === 'create' || !text.trim() || !priceValid}
          onClick={() =>
            run('create', async () => {
              await createFutures(text, price);
              setText('');
              setMsg('Futures market opened.');
            })
          }
        >
          {busy === 'create' ? 'Opening…' : 'Open'}
        </button>
      </div>
      <p className="mt-1 text-xs text-ink/40">
        Set the fair starting YES price you think is right — it opens at {priceValid ? price : 50}¢ and
        then moves as people trade. Resolve it YES/NO when you know the outcome.
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
                  onClick={() => run(m.id, () => resolveFutures(m.id, 'YES'))}
                >
                  Resolve YES
                </button>
                <button
                  className="flex-1 rounded-lg bg-no py-1.5 text-sm font-semibold text-white hover:bg-no-dark disabled:opacity-40"
                  disabled={busy === m.id}
                  onClick={() => run(m.id, () => resolveFutures(m.id, 'NO'))}
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
