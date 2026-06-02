import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useUser } from '../hooks/useUser';
import { MIN_BUY, CURRENCY } from '../config/constants';

interface HiwContextValue {
  open: () => void;
}
const HiwContext = createContext<HiwContextValue | null>(null);

const seenKey = (uid: string) => `mm_hiw_seen_${uid}`;

/** Provides the "How it works" modal: auto-opens once per user (OQ-10), reachable via open(). */
export function HowItWorksProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!localStorage.getItem(seenKey(user.uid))) {
      setIsOpen(true);
      localStorage.setItem(seenKey(user.uid), '1');
    }
  }, [user]);

  return (
    <HiwContext.Provider value={{ open: () => setIsOpen(true) }}>
      {children}
      {isOpen && <HowItWorksModal onClose={() => setIsOpen(false)} />}
    </HiwContext.Provider>
  );
}

export function useHowItWorks(): HiwContextValue {
  const ctx = useContext(HiwContext);
  if (!ctx) throw new Error('useHowItWorks must be used within <HowItWorksProvider>');
  return ctx;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink/70">{children}</p>
    </div>
  );
}

function HowItWorksModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-paper p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-3xl">{CURRENCY.symbol}</div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">How Milk Market works</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-ink/40 hover:bg-ink/5 hover:text-ink"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <Section title="It’s all fake money 🥛">
            Everyone starts with <b>1,000 {CURRENCY.symbol}</b>. It’s not real — it’s just for bragging
            rights on the leaderboard.
          </Section>
          <Section title="YES or NO">
            Every market is a yes/no question (like “Does Milk Lord win this game?”). You bet by buying{' '}
            <span className="font-semibold text-yes">YES</span> or{' '}
            <span className="font-semibold text-no">NO</span> shares.
          </Section>
          <Section title="Price = the crowd’s guess">
            A price is in cents from 0–100. <b>If Win is at 65¢, the group thinks there’s a 65% chance
            he wins.</b> Buy YES for 65¢; if he wins, each share is worth 100¢.
          </Section>
          <Section title="Buying & selling">
            Buying nudges the price toward your side. You can <b>sell anytime before a market locks</b>{' '}
            to cash out at the current price — no fees. The minimum buy is{' '}
            <b>{MIN_BUY} {CURRENCY.symbol}</b>.
          </Section>
          <Section title="Winning">
            When a market resolves, each winning share pays <b>100¢ (1 {CURRENCY.symbol})</b> and losing
            shares pay nothing. Your leaderboard rank is your cash plus the value of your open bets.
          </Section>
          <Section title="No do-overs">
            Once a market resolves, <b>it’s final</b> — no refunds. Remakes and weird games still resolve
            as-is.
          </Section>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-paper hover:bg-ink/90"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
