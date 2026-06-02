import { useState } from 'react';
import { buyCost, sellProceeds } from '../lib/lmsr';
import { buyShares, sellShares, TradeError } from '../lib/trades';
import { MIN_BUY, CURRENCY } from '../config/constants';
import { formatMilk, formatCents } from '../lib/money';
import type { Market, Position, Side, User } from '../lib/types';

export default function TradePanel({
  market,
  user,
  position,
}: {
  market: Market;
  user: User;
  position: Position | null;
}) {
  const [tab, setTab] = useState<'BUY' | 'SELL'>('BUY');
  const [side, setSide] = useState<Side>('YES');
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  if (market.status !== 'open') {
    return (
      <div className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-4 text-sm text-ink/50">
        Trading is closed — this market is <b>{market.status}</b>.
      </div>
    );
  }

  const shares = Number(qty);
  const valid = Number.isFinite(shares) && shares > 0;
  const { qYes, qNo, b } = market.lmsr;
  const held = side === 'YES' ? (position?.yesShares ?? 0) : (position?.noShares ?? 0);

  const quote = valid
    ? tab === 'BUY'
      ? buyCost(qYes, qNo, side, shares, b)
      : sellProceeds(qYes, qNo, side, shares, b)
    : null;

  const sidePrice = (cents: number) => (side === 'YES' ? cents : 100 - cents);
  const curSidePrice = sidePrice(market.priceYes);
  const newSidePrice = quote ? sidePrice(quote.newPriceYesCents) : curSidePrice;

  let blockMsg = '';
  if (valid && quote) {
    if (tab === 'BUY') {
      if (quote.amount < MIN_BUY)
        blockMsg = `Minimum buy is ${MIN_BUY} ${CURRENCY.symbol} — that's only ${formatMilk(quote.amount)}.`;
      else if (quote.amount > user.balance)
        blockMsg = `Not enough cash — you have ${formatMilk(user.balance)}.`;
    } else if (shares > held) {
      blockMsg = `You only hold ${held} ${side} shares here.`;
    }
  }
  const canSubmit = valid && !!quote && !blockMsg && !busy;

  async function submit() {
    if (!canSubmit || !quote) return;
    setBusy(true);
    setError('');
    setOk('');
    try {
      if (tab === 'BUY') {
        const cost = await buyShares(user.uid, market.id, side, shares);
        setOk(`Bought ${shares} ${side} for ${formatMilk(cost)}.`);
      } else {
        const proceeds = await sellShares(user.uid, market.id, side, shares);
        setOk(`Sold ${shares} ${side} for ${formatMilk(proceeds)}.`);
      }
      setQty('');
    } catch (e) {
      setError(e instanceof TradeError ? e.message : 'Trade failed — please try again.');
    } finally {
      setBusy(false);
    }
  }

  const tabBtn = (t: 'BUY' | 'SELL') =>
    `flex-1 rounded-lg py-1.5 text-sm font-semibold transition ${
      tab === t ? 'bg-paper text-ink shadow-sm' : 'text-ink/50'
    }`;

  return (
    <div className="rounded-2xl border border-ink/10 bg-paper p-4 shadow-card">
      {/* BUY / SELL tabs */}
      <div className="mb-3 flex gap-1 rounded-xl bg-ink/5 p-1">
        <button className={tabBtn('BUY')} onClick={() => setTab('BUY')}>
          Buy
        </button>
        <button className={tabBtn('SELL')} onClick={() => setTab('SELL')}>
          Sell
        </button>
      </div>

      {/* YES / NO toggle */}
      <div className="flex gap-2">
        {/* explicit classes so Tailwind keeps them: yes/no variants */}
        <button
          onClick={() => setSide('YES')}
          className={
            side === 'YES'
              ? 'flex-1 rounded-xl border border-yes bg-yes-soft py-2 text-sm font-semibold text-yes-dark dark:bg-yes/15 dark:text-yes'
              : 'flex-1 rounded-xl border border-ink/15 py-2 text-sm font-semibold text-ink/50 hover:border-ink/30'
          }
        >
          YES · {formatCents(market.priceYes)}
        </button>
        <button
          onClick={() => setSide('NO')}
          className={
            side === 'NO'
              ? 'flex-1 rounded-xl border border-no bg-no-soft py-2 text-sm font-semibold text-no-dark dark:bg-no/15 dark:text-no'
              : 'flex-1 rounded-xl border border-ink/15 py-2 text-sm font-semibold text-ink/50 hover:border-ink/30'
          }
        >
          NO · {formatCents(100 - market.priceYes)}
        </button>
      </div>

      {/* quantity */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-ink/60">Shares</label>
          {tab === 'SELL' && (
            <button
              className="text-xs font-medium text-ink/50 hover:text-ink"
              onClick={() => setQty(String(held))}
            >
              Max {held}
            </button>
          )}
        </div>
        <input
          type="number"
          min={0}
          step={tab === 'SELL' ? 'any' : 1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="0"
          className="tnum mt-1 w-full rounded-xl border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
        />
      </div>

      {/* preview */}
      {quote && (
        <div className="mt-3 space-y-1 rounded-xl bg-ink/[0.03] px-3 py-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-ink/60">{tab === 'BUY' ? 'You pay' : 'You receive'}</span>
            <span className="tnum font-semibold">{formatMilk(quote.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/60">{side} price</span>
            <span className="tnum font-medium">
              {formatCents(curSidePrice)} → {formatCents(newSidePrice)}
            </span>
          </div>
        </div>
      )}

      {blockMsg && <p className="mt-2 text-sm text-no">{blockMsg}</p>}
      {error && <p className="mt-2 text-sm text-no">{error}</p>}
      {ok && <p className="mt-2 text-sm text-yes-dark">{ok}</p>}

      <button
        disabled={!canSubmit}
        onClick={submit}
        className={`mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 ${
          side === 'YES'
            ? 'bg-gradient-to-b from-yes to-yes-dark'
            : 'bg-gradient-to-b from-no to-no-dark'
        }`}
      >
        {busy ? 'Working…' : `${tab === 'BUY' ? 'Buy' : 'Sell'} ${side}`}
      </button>
    </div>
  );
}
