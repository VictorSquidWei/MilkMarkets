import { useMemo } from 'react';
import { useRecentTrades } from '../hooks/useRecentTrades';
import { useAllUsers } from '../hooks/useAllUsers';
import { useMarkets } from '../hooks/useMarkets';
import { useUser } from '../hooks/useUser';
import { JOE_DISPLAY_NAME } from '../config/constants';
import { formatCents, formatMilk, formatShares } from '../lib/money';

interface TickerItem {
  id: string;
  name: string;
  action: 'BUY' | 'SELL';
  side: 'YES' | 'NO';
  shares: number;
  price: number;
  amount: number;
  title: string;
}

const SECONDS_PER_ITEM = 2.8; // calm upward crawl

function Row({ it }: { it: TickerItem }) {
  const yes = it.side === 'YES';
  const sideText = yes ? 'text-yes-dark dark:text-yes' : 'text-no-dark dark:text-no';
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
      <span className={`text-[10px] ${yes ? 'text-yes' : 'text-no'}`}>
        {it.action === 'BUY' ? '▲' : '▼'}
      </span>
      <b className="shrink-0 text-ink/80">{it.name}</b>
      <span className="shrink-0 text-ink/40">{it.action === 'BUY' ? 'bought' : 'sold'}</span>
      <span className={`shrink-0 font-semibold ${sideText}`}>
        {formatShares(it.shares)} {it.side}
      </span>
      <span className="tnum shrink-0 text-ink/50">@ {formatCents(it.price)}</span>
      <span className="tnum shrink-0 text-ink/45">{formatMilk(it.amount)}</span>
      <span className="ml-auto min-w-0 max-w-[42%] truncate text-ink/40">{it.title}</span>
    </div>
  );
}

export default function Ticker() {
  const trades = useRecentTrades(25);
  const { users } = useAllUsers();
  const { markets } = useMarkets();
  const { user } = useUser();
  const isJoe = user?.displayName === JOE_DISPLAY_NAME; // fairness: hide Joe-market activity from Joe

  const items = useMemo<TickerItem[]>(() => {
    const nameByUid = new Map(users.map((u) => [u.uid, u.displayName]));
    const titleById = new Map(markets.map((m) => [m.id, m.title]));
    const catById = new Map(markets.map((m) => [m.id, m.category]));
    return trades
      .filter((t) => !(isJoe && catById.get(t.marketId) === 'joe'))
      .map((t) => ({
      id: t.id,
      name: nameByUid.get(t.uid) ?? '—',
      action: t.action,
      side: t.side,
      shares: t.shares,
      price: t.priceAfter,
      amount: t.cost,
      title: titleById.get(t.marketId) ?? 'market',
    }));
  }, [trades, users, markets, isJoe]);

  // Pace scales with count so it stays a calm crawl whether there are 3 trades or 25.
  const durationSec = Math.max(items.length, 6) * SECONDS_PER_ITEM;

  return (
    <div className="ticker-wrap mb-5 overflow-hidden rounded-2xl border border-ink/[0.08] bg-paper/70 shadow-card backdrop-blur">
      <div className="flex items-center gap-1.5 border-b border-ink/[0.06] px-3 py-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yes" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink/50">Live activity</span>
      </div>
      {items.length ? (
        <div className="h-24 overflow-hidden">
          <div className="animate-ticker-y flex flex-col" style={{ animationDuration: `${durationSec}s` }}>
            {[...items, ...items].map((it, i) => (
              <Row key={`${it.id}-${i}`} it={it} />
            ))}
          </div>
        </div>
      ) : (
        <div className="px-3 py-3 text-xs text-ink/40">
          Live trades show here as people buy &amp; sell. Be the first.
        </div>
      )}
    </div>
  );
}
