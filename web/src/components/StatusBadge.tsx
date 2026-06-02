import type { Market } from '../lib/types';

export function StatusBadge({ market }: { market: Market }) {
  if (market.status === 'open')
    return (
      <span className="whitespace-nowrap rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink/60">
        Open
      </span>
    );
  if (market.status === 'locked')
    return (
      <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        Locked
      </span>
    );
  const yes = market.outcome === 'YES';
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
        yes ? 'bg-yes-soft text-yes-dark' : 'bg-no-soft text-no-dark'
      }`}
    >
      Resolved · {market.outcome}
    </span>
  );
}
