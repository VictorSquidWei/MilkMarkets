import { Link } from 'react-router-dom';
import type { Market } from '../lib/types';
import { formatCents, formatPct } from '../lib/money';
import { StatusBadge } from './StatusBadge';
import { CATEGORY_LABEL } from '../lib/labels';

export default function MarketCard({ market }: { market: Market }) {
  const yes = market.priceYes;
  const no = 100 - yes;
  const resolved = market.status === 'resolved';
  return (
    <Link
      to={`/market/${market.id}`}
      className={`group block rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-pop ${
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
        <div className="flex-1 rounded-xl bg-yes-soft px-3 py-2 ring-1 ring-yes/10">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-yes-dark/80">YES</div>
          <div className="tnum text-lg font-bold text-yes-dark">
            {formatCents(yes)}{' '}
            <span className="text-xs font-medium opacity-60">{formatPct(yes)}</span>
          </div>
        </div>
        <div className="flex-1 rounded-xl bg-no-soft px-3 py-2 ring-1 ring-no/10">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-no-dark/80">NO</div>
          <div className="tnum text-lg font-bold text-no-dark">
            {formatCents(no)} <span className="text-xs font-medium opacity-60">{formatPct(no)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
