import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useUser } from '../hooks/useUser';
import { usePositions } from '../hooks/usePositions';
import { useMarkets } from '../hooks/useMarkets';
import { useMyTrades } from '../hooks/useMyTrades';
import { mtm } from '../lib/lmsr';
import { formatMilk, formatShares, formatCents, formatSignedMilk } from '../lib/money';
import { formatPSTShort } from '../lib/time';
import { CATEGORY_LABEL } from '../lib/labels';
import Loading from '../components/Loading';

type TradeFilter = 'all' | 'BUY' | 'SELL';

export default function Portfolio() {
  const { user, loading } = useUser();
  const { positions } = usePositions(user?.uid);
  const { markets } = useMarkets();
  const { trades } = useMyTrades(user?.uid);
  const [showHist, setShowHist] = useState(false);
  const [filter, setFilter] = useState<TradeFilter>('all');
  if (loading || !user) return <Loading />;

  const filteredTrades = filter === 'all' ? trades : trades.filter((t) => t.action === filter);

  const marketById = new Map(markets.map((m) => [m.id, m]));
  const open = positions
    .filter((p) => p.yesShares + p.noShares > 0 && !p.settled)
    .map((p) => {
      const m = marketById.get(p.marketId);
      return m && m.status !== 'resolved' ? { p, m } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const openValue = open.reduce((sum, { p, m }) => sum + mtm(p.yesShares, p.noShares, m.priceYes / 100), 0);
  const bankroll = user.balance + openValue;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Cash" value={formatMilk(user.balance)} />
        <Stat label="Open positions" value={formatMilk(openValue)} />
        <Stat label="Bankroll" value={formatMilk(bankroll)} accent />
      </div>

      <h2 className="mb-2 mt-7 text-lg font-semibold tracking-tight">Open positions</h2>
      {open.length ? (
        <div className="space-y-2">
          {open.map(({ p, m }) => {
            const value = mtm(p.yesShares, p.noShares, m.priceYes / 100);
            const totalShares = p.yesShares + p.noShares;
            const avgCents = totalShares > 0 ? (p.costBasis / totalShares) * 100 : 0;
            const onlyNo = p.noShares > 0 && p.yesShares === 0;
            const nowCents = onlyNo ? 100 - m.priceYes : m.priceYes;
            const pnl = value - p.costBasis;
            return (
              <Link
                key={p.id}
                to={`/market/${m.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-paper p-4 shadow-card transition hover:border-ink/25 hover:shadow-pop"
              >
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-ink/40">
                    {CATEGORY_LABEL[m.category]}
                  </div>
                  <div className="truncate font-medium">{m.title}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    {p.yesShares > 0 && (
                      <span className="rounded-md bg-yes-soft px-1.5 py-0.5 font-semibold text-yes-dark dark:bg-yes/15 dark:text-yes">
                        {formatShares(p.yesShares)} YES
                      </span>
                    )}
                    {p.noShares > 0 && (
                      <span className="rounded-md bg-no-soft px-1.5 py-0.5 font-semibold text-no-dark dark:bg-no/15 dark:text-no">
                        {formatShares(p.noShares)} NO
                      </span>
                    )}
                    <span className="rounded-md bg-ink/[0.06] px-1.5 py-0.5 font-medium text-ink/70">
                      Bought {formatCents(avgCents)}
                    </span>
                    <span className="text-ink/45">now {formatCents(nowCents)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tnum font-semibold">{formatMilk(value)}</div>
                  <div
                    className={`tnum text-xs font-medium ${
                      pnl >= 0 ? 'text-yes-dark dark:text-yes' : 'text-no-dark dark:text-no'
                    }`}
                  >
                    {formatSignedMilk(pnl)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink/40">
          No open positions. Head to Markets to place a bet.
        </div>
      )}

      <div className="mt-7">
        <button
          onClick={() => setShowHist((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl py-1 text-left transition hover:opacity-80"
          aria-expanded={showHist}
        >
          <span className="text-lg font-semibold tracking-tight">
            Trade history <span className="font-normal text-ink/40">({trades.length})</span>
          </span>
          <ChevronDown
            size={18}
            className={`text-ink/40 transition-transform ${showHist ? 'rotate-180' : ''}`}
          />
        </button>

        {showHist && (
          <div className="mt-3">
            <div className="mb-3 inline-flex rounded-xl border border-ink/10 p-0.5 text-xs">
              {(['all', 'BUY', 'SELL'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-lg px-3 py-1 font-medium transition ${
                    filter === f ? 'bg-ink text-paper' : 'text-ink/50 hover:text-ink'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'BUY' ? 'Buys' : 'Sells'}
                </button>
              ))}
            </div>

            {filteredTrades.length ? (
              <div className="divide-y divide-ink/[0.06] overflow-hidden rounded-2xl border border-ink/[0.06] bg-paper shadow-card">
                {filteredTrades.map((t) => {
                  const m = marketById.get(t.marketId);
                  const yes = t.side === 'YES';
                  const buy = t.action === 'BUY';
                  const outcome = m && m.status === 'resolved' ? m.outcome : null;
                  // Per-trade realized P&L (only once the market resolved). These per-trade values
                  // sum to the position's realized P&L, so they reconcile with the leaderboard (§D-1.5).
                  const realized = outcome
                    ? buy
                      ? (outcome === t.side ? t.shares : 0) - t.cost
                      : t.cost - (outcome === t.side ? t.shares : 0)
                    : null;
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="rounded bg-ink/[0.07] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/60">
                            {buy ? 'Buy' : 'Sell'}
                          </span>
                          <span
                            className={`font-semibold ${yes ? 'text-yes-dark dark:text-yes' : 'text-no-dark dark:text-no'}`}
                          >
                            {formatShares(t.shares)} {t.side}
                          </span>
                          <span className="tnum text-ink/50">@ {formatCents(t.priceAfter)}</span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-ink/45">
                          {m?.title ?? 'market'} · {formatPSTShort(t.ts)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tnum text-sm font-semibold text-ink/70">
                          {buy ? '−' : '+'}
                          {formatMilk(t.cost)}
                        </div>
                        {realized != null && (
                          <div
                            className={`tnum text-[11px] font-semibold ${
                              realized >= 0
                                ? 'text-yes-dark dark:text-yes'
                                : 'text-no-dark dark:text-no'
                            }`}
                            title={
                              buy
                                ? 'Realized P&L — payout at resolution minus what you paid'
                                : 'Realized P&L — proceeds minus what these shares would have paid at resolution'
                            }
                          >
                            P&L {formatSignedMilk(realized)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-ink/15 px-4 py-6 text-center text-sm text-ink/40">
                {filter === 'all'
                  ? 'No trades yet — buy something to start your history.'
                  : `No ${filter === 'BUY' ? 'buys' : 'sells'} yet.`}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-3 shadow-card ${
        accent
          ? 'bg-gradient-to-br from-[#15161b] to-[#33343f] text-white ring-1 ring-white/10'
          : 'border border-ink/[0.06] bg-paper'
      }`}
    >
      <div className={`text-xs ${accent ? 'text-white/60' : 'text-ink/50'}`}>{label}</div>
      <div className="tnum mt-0.5 text-lg font-bold">{value}</div>
    </div>
  );
}
