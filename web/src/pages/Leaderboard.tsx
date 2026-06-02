import { useState } from 'react';
import { useAllUsers, useAllPositions } from '../hooks/useAllUsers';
import { useMarkets } from '../hooks/useMarkets';
import { useUser } from '../hooks/useUser';
import { buildLeaderboard, type LeaderRow } from '../lib/leaderboard';
import { formatMilk, formatSignedMilk } from '../lib/money';
import Loading from '../components/Loading';

type SortKey = 'bankroll' | 'realizedProfit' | 'wl';

const sortValue = (r: LeaderRow, key: SortKey) =>
  key === 'wl' ? r.wins - r.losses : key === 'realizedProfit' ? r.realizedProfit : r.bankroll;

export default function Leaderboard() {
  const { users, loading: lu } = useAllUsers();
  const { positions, loading: lp } = useAllPositions();
  const { markets, loading: lm } = useMarkets();
  const { user: me } = useUser();
  const [sortKey, setSortKey] = useState<SortKey>('bankroll');

  if (lu || lp || lm) return <Loading />;

  const rows = buildLeaderboard(users, positions, markets).sort(
    (a, b) => sortValue(b, sortKey) - sortValue(a, sortKey),
  );

  const Th = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`px-3 py-2 ${className}`}>
      <button
        onClick={() => setSortKey(k)}
        className={`font-medium ${sortKey === k ? 'text-ink' : 'text-ink/40 hover:text-ink/70'}`}
      >
        {children}
      </button>
    </th>
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
      <p className="mt-1 text-sm text-ink/50">Bankroll = cash + the value of your open bets.</p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-ink/[0.03] text-left text-xs">
            <tr>
              <th className="px-3 py-2 text-ink/40">#</th>
              <th className="px-3 py-2 text-ink/40">Trader</th>
              <Th k="bankroll" className="text-right">
                Bankroll
              </Th>
              <Th k="realizedProfit" className="text-right">
                Realized
              </Th>
              <Th k="wl" className="text-right">
                W–L
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {rows.map((r, i) => {
              const isMe = me?.uid === r.uid;
              return (
                <tr key={r.uid} className={isMe ? 'bg-milk-100 dark:bg-ink/10' : ''}>
                  <td className="tnum px-3 py-2.5 text-ink/40">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium">
                    {r.displayName}
                    {isMe && <span className="ml-1 text-xs text-ink/40">(you)</span>}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right font-semibold">{formatMilk(r.bankroll)}</td>
                  <td
                    className={`tnum px-3 py-2.5 text-right ${
                      r.realizedProfit > 0
                        ? 'text-yes-dark dark:text-yes'
                        : r.realizedProfit < 0
                          ? 'text-no-dark dark:text-no'
                          : 'text-ink/50'
                    }`}
                  >
                    {formatSignedMilk(r.realizedProfit)}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right text-ink/70">
                    {r.wins}–{r.losses}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
