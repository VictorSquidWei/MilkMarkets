import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import type { Market, Position } from '../lib/types';
import { formatCents, formatPct, formatShares } from '../lib/money';
import { StatusBadge } from './StatusBadge';
import { CATEGORY_LABEL } from '../lib/labels';

export default function MarketCard({
  market,
  position,
}: {
  market: Market;
  position?: Position | null;
}) {
  const yes = market.priceYes;
  const no = 100 - yes;
  const resolved = market.status === 'resolved';
  const holding = !!position && position.yesShares + position.noShares > 0 && !position.settled;
  return (
    <Link
      to={`/market/${market.id}`}
      className={`group block rounded-2xl border border-ink/[0.06] bg-paper p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-pop ${
        resolved ? 'opacity-80' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink/35">
            {CATEGORY_LABEL[market.category]}
          </div>
          <div className="mt-1 font-semibold leading-snug">{market.title}</div>
        </div>
        <StatusBadge market={market} />
      </div>
      <div className="mt-3.5 flex gap-2">
        <div className="flex-1 rounded-xl bg-yes-soft px-3 py-2 ring-1 ring-yes/10 dark:bg-yes/15 dark:ring-yes/25">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-yes-dark/80 dark:text-yes">
            YES
          </div>
          <div className="tnum text-lg font-bold text-yes-dark dark:text-yes">
            {formatCents(yes)}{' '}
            <span className="text-xs font-medium opacity-60">{formatPct(yes)}</span>
          </div>
        </div>
        <div className="flex-1 rounded-xl bg-no-soft px-3 py-2 ring-1 ring-no/10 dark:bg-no/15 dark:ring-no/25">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-no-dark/80 dark:text-no">
            NO
          </div>
          <div className="tnum text-lg font-bold text-no-dark dark:text-no">
            {formatCents(no)} <span className="text-xs font-medium opacity-60">{formatPct(no)}</span>
          </div>
        </div>
      </div>
      {holding && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-ink/[0.05] px-2.5 py-1.5 text-[11px] font-medium text-ink/60">
          <Wallet size={12} className="shrink-0 text-ink/45" />
          <span>You hold</span>
          {position!.yesShares > 0 && (
            <span className="font-semibold text-yes-dark dark:text-yes">
              {formatShares(position!.yesShares)} YES
            </span>
          )}
          {position!.noShares > 0 && (
            <span className="font-semibold text-no-dark dark:text-no">
              {formatShares(position!.noShares)} NO
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
