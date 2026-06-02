import { Fragment, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useMarkets } from '../hooks/useMarkets';
import { useGames } from '../hooks/useGames';
import { useTracked } from '../hooks/useTracked';
import { useUser } from '../hooks/useUser';
import { usePositions } from '../hooks/usePositions';
import MarketCard from '../components/MarketCard';
import Ticker from '../components/Ticker';
import Loading from '../components/Loading';
import type { Game, MarketCategory, Position } from '../lib/types';

const LOL_ORDER: Record<string, number> = { lol_win: 0, lol_kda: 1, lol_cs: 2 };

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3 mt-7 first:mt-0">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {sub && <p className="text-sm text-ink/50">{sub}</p>}
    </div>
  );
}

export default function Home() {
  const { markets, loading } = useMarkets();
  const { games } = useGames();
  const tracked = useTracked();
  const { user } = useUser();
  const { positions } = usePositions(user?.uid);
  const [showHistory, setShowHistory] = useState(false);
  if (loading) return <Loading />;

  const posByMarket = new Map<string, Position>(
    positions.filter((p) => p.yesShares + p.noShares > 0 && !p.settled).map((p) => [p.marketId, p]),
  );

  const activeGames = games.filter((g) => g.status !== 'resolved'); // newest-first
  const gameMarkets = (g: Game) =>
    markets
      .filter((m) => m.gameId === g.gameId)
      .sort((a, b) => (LOL_ORDER[a.category] ?? 9) - (LOL_ORDER[b.category] ?? 9));
  const lolLabel = (g: Game) =>
    g.player ? `${g.player.gameName}#${g.player.tagLine}` : `${tracked.gameName}#${tracked.tagLine}`;
  const lolSub = (g: Game) => {
    const parts: string[] = [];
    if (g.marketIds.kda) parts.push(`KDA over ${g.kdaLine}`);
    if (g.marketIds.cs) parts.push(`CS/min over ${g.csLine}`);
    return parts.length ? parts.join(' · ') : undefined;
  };

  const joeActive = markets.filter(
    (m) => m.category === ('joe' as MarketCategory) && m.status !== 'resolved',
  );
  const resolved = markets.filter((m) => m.status === 'resolved'); // newest-first (createdAt desc)

  return (
    <div>
      <Ticker />
      <h1 className="text-2xl font-semibold tracking-tight">Markets</h1>
      <p className="mt-0.5 text-sm text-ink/50">
        Live markets you can trade. Resolved ones are tucked into History at the bottom.
      </p>

      {activeGames.length ? (
        activeGames.map((g) => (
          <Fragment key={g.gameId}>
            <SectionHeading title={`League of Legends · ${lolLabel(g)}`} sub={lolSub(g)} />
            <div className="grid gap-3 sm:grid-cols-2">
              {gameMarkets(g).map((m) => (
                <MarketCard key={m.id} market={m} position={posByMarket.get(m.id)} />
              ))}
            </div>
          </Fragment>
        ))
      ) : (
        <>
          <SectionHeading title="League of Legends" />
          <EmptyCard text="No live LoL games. An admin opens one when a tracked player queues up." />
        </>
      )}

      <SectionHeading title="Things Joe Says" />
      {joeActive.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {joeActive.map((m) => (
            <MarketCard key={m.id} market={m} position={posByMarket.get(m.id)} />
          ))}
        </div>
      ) : (
        <EmptyCard text="No live Joe market right now." />
      )}

      {resolved.length > 0 && (
        <div className="mt-7">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl py-1 text-left transition hover:opacity-80"
            aria-expanded={showHistory}
          >
            <span className="text-lg font-semibold tracking-tight">
              History <span className="font-normal text-ink/40">({resolved.length})</span>
            </span>
            <ChevronDown
              size={18}
              className={`text-ink/40 transition-transform ${showHistory ? 'rotate-180' : ''}`}
            />
          </button>
          {showHistory && (
            <div className="mt-3 grid gap-3 opacity-90 sm:grid-cols-2">
              {resolved.map((m) => (
                <MarketCard key={m.id} market={m} position={posByMarket.get(m.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink/40">
      {text}
    </div>
  );
}
