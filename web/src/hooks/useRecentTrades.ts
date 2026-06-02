import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Trade, TradeDoc } from '../lib/types';

/** Live feed of the most recent trades across all markets (for the ticker). */
export function useRecentTrades(n = 25) {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'trades'), orderBy('ts', 'desc'), limit(n));
    return onSnapshot(q, (snap) => {
      setTrades(snap.docs.map((d) => ({ id: d.id, ...(d.data() as TradeDoc) })));
    });
  }, [n]);

  return trades;
}
