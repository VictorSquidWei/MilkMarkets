import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Wallet } from 'lucide-react';
import { useMarket } from '../hooks/useMarket';
import { useUser } from '../hooks/useUser';
import { usePositions } from '../hooks/usePositions';
import TradePanel from '../components/TradePanel';
import PriceChart from '../components/PriceChart';
import { StatusBadge } from '../components/StatusBadge';
import Loading from '../components/Loading';
import { mtm } from '../lib/lmsr';
import { CATEGORY_LABEL } from '../lib/labels';
import { formatCents, formatPct, formatShares, formatMilk, formatSignedMilk } from '../lib/money';

export default function MarketDetail() {
  const { id } = useParams();
  const { market, loading } = useMarket(id);
  const { user } = useUser();
  const { positions } = usePositions(user?.uid);

  if (loading || !user) return <Loading />;
  if (!market) return <div className="p-2 text-sm text-ink/50">Market not found.</div>;

  const position = positions.find((p) => p.marketId === market.id) ?? null;
  const yes = market.priceYes;
  const no = 100 - yes;
  const lineLabel =
    market.category === 'lol_kda'
      ? `YES if KDA is over ${market.line}`
      : market.category === 'lol_cs'
        ? `YES if CS/min is over ${market.line}`
        : null;

  const holding =
    !!position && position.yesShares + position.noShares > 0 && market.status !== 'resolved';
  const posValue = position ? mtm(position.yesShares, position.noShares, yes / 100) : 0;
  const posPnl = position ? posValue - position.costBasis : 0;

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={15} /> Markets
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink/40">
            {CATEGORY_LABEL[market.category]}
          </div>
          <h1 className="mt-0.5 text-xl font-semibold leading-snug">{market.title}</h1>
          {lineLabel && <p className="mt-1 text-sm text-ink/50">{lineLabel}</p>}
        </div>
        <StatusBadge market={market} />
      </div>

      {market.status === 'resolved' && (
        <div
          className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
            market.outcome === 'YES'
              ? 'bg-yes-soft text-yes-dark dark:bg-yes/15 dark:text-yes'
              : 'bg-no-soft text-no-dark dark:bg-no/15 dark:text-no'
          }`}
        >
          Resolved {market.outcome} — {market.outcome === 'YES' ? 'YES' : 'NO'} shares paid 100¢.
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <div className="flex-1 rounded-2xl bg-yes-soft px-4 py-3 ring-1 ring-yes/10 dark:bg-yes/15 dark:ring-yes/25">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-yes-dark/80 dark:text-yes">
            YES
          </div>
          <div className="tnum text-2xl font-bold text-yes-dark dark:text-yes">{formatCents(yes)}</div>
          <div className="text-xs text-yes-dark/70 dark:text-yes/70">{formatPct(yes)} chance</div>
        </div>
        <div className="flex-1 rounded-2xl bg-no-soft px-4 py-3 ring-1 ring-no/10 dark:bg-no/15 dark:ring-no/25">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-no-dark/80 dark:text-no">
            NO
          </div>
          <div className="tnum text-2xl font-bold text-no-dark dark:text-no">{formatCents(no)}</div>
          <div className="text-xs text-no-dark/70 dark:text-no/70">{formatPct(no)} chance</div>
        </div>
      </div>

      {holding && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-card">
          <div className="flex items-center gap-1.5 border-b border-ink/[0.06] bg-ink/[0.03] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink/55">
            <Wallet size={13} /> Your position
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
            <div className="flex gap-6">
              {position!.yesShares > 0 && (
                <div>
                  <div className="tnum text-xl font-bold text-yes-dark dark:text-yes">
                    {formatShares(position!.yesShares)}
                  </div>
                  <div className="text-xs text-ink/50">YES shares</div>
                </div>
              )}
              {position!.noShares > 0 && (
                <div>
                  <div className="tnum text-xl font-bold text-no-dark dark:text-no">
                    {formatShares(position!.noShares)}
                  </div>
                  <div className="text-xs text-ink/50">NO shares</div>
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="tnum text-xl font-bold">{formatMilk(posValue)}</div>
              <div
                className={`text-xs font-medium ${
                  posPnl >= 0 ? 'text-yes-dark dark:text-yes' : 'text-no-dark dark:text-no'
                }`}
              >
                {formatSignedMilk(posPnl)} {posPnl >= 0 ? '▲' : '▼'} unrealized
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-ink/10 bg-paper p-3 text-ink/70 shadow-card">
        <PriceChart history={market.priceHistory} />
      </div>

      <div className="mt-4">
        <TradePanel market={market} user={user} position={position} />
      </div>
    </div>
  );
}
