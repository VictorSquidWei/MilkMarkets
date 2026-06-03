import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Trade, TradeDoc } from '../lib/types';

/**
 * Live list of one user's own trades, newest-first. Sorted client-side so we only need the
 * automatic single-field index on `uid` (no composite index / no deploy).
 */
export function useMyTrades(uid: string | undefined) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setTrades([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'trades'), where('uid', '==', uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TradeDoc) }));
      list.sort((a, b) => b.ts - a.ts);
      setTrades(list);
      setLoading(false);
    });
  }, [uid]);

  return { trades, loading };
}
