import { Link } from 'react-router-dom';
import { useUser } from '../hooks/useUser';
import { usePositions } from '../hooks/usePositions';
import { useMarkets } from '../hooks/useMarkets';
import { mtm } from '../lib/lmsr';
import { formatMilk, formatShares, formatCents } from '../lib/money';
import { CATEGORY_LABEL } from '../lib/labels';
import Loading from '../components/Loading';

export default function Portfolio() {
  const { user, loading } = useUser();
  const { positions } = usePositions(user?.uid);
  const { markets } = useMarkets();
  if (loading || !user) return <Loading />;

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
            return (
              <Link
                key={p.id}
                to={`/market/${m.id}`}
                className="flex items-center justify-between rounded-2xl border border-ink/10 bg-paper p-4 shadow-card hover:border-ink/25"
              >
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-ink/40">
                    {CATEGORY_LABEL[m.category]}
                  </div>
                  <div className="truncate font-medium">{m.title}</div>
                  <div className="mt-0.5 text-xs text-ink/50">
                    {p.yesShares > 0 && (
                      <span className="text-yes-dark">{formatShares(p.yesShares)} YES </span>
                    )}
                    {p.noShares > 0 && (
                      <span className="text-no-dark">{formatShares(p.noShares)} NO </span>
                    )}
                    · YES {formatCents(m.priceYes)}
                  </div>
                </div>
                <div className="tnum shrink-0 text-right font-semibold">{formatMilk(value)}</div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink/40">
          No open positions. Head to Markets to place a bet.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-3 shadow-card ${
        accent
          ? 'bg-gradient-to-br from-ink to-[#34343c] text-paper'
          : 'border border-ink/[0.06] bg-white'
      }`}
    >
      <div className={`text-xs ${accent ? 'text-paper/60' : 'text-ink/50'}`}>{label}</div>
      <div className="tnum mt-0.5 text-lg font-bold">{value}</div>
    </div>
  );
}
