import type { Market } from '../lib/types';

export function StatusBadge({ market }: { market: Market }) {
  if (market.status === 'open')
    return (
      <span className="whitespace-nowrap rounded-full bg-ink/[0.06] px-2 py-0.5 text-xs font-medium text-ink/60">
        Open
      </span>
    );
  if (market.status === 'locked')
    return (
      <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
        Locked
      </span>
    );
  const yes = market.outcome === 'YES';
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
        yes
          ? 'bg-yes-soft text-yes-dark dark:bg-yes/15 dark:text-yes'
          : 'bg-no-soft text-no-dark dark:bg-no/15 dark:text-no'
      }`}
    >
      Resolved · {market.outcome}
    </span>
  );
}
