import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Market, MarketDoc } from '../lib/types';

/** Live snapshot of a single market. */
export function useMarket(marketId: string | undefined) {
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!marketId) {
      setMarket(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(doc(db, 'markets', marketId), (snap) => {
      setMarket(snap.exists() ? { id: snap.id, ...(snap.data() as MarketDoc) } : null);
      setLoading(false);
    });
  }, [marketId]);

  return { market, loading };
}
