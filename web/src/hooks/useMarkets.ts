import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Market, MarketDoc } from '../lib/types';

/** Live list of all markets, newest first. */
export function useMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'markets'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setMarkets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as MarketDoc) })));
      setLoading(false);
    });
  }, []);

  return { markets, loading };
}
