import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Game, GameDoc } from '../lib/types';

/** Live list of LoL games, newest first. */
export function useGames() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'games'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setGames(snap.docs.map((d) => ({ gameId: d.id, ...(d.data() as GameDoc) })));
      setLoading(false);
    });
  }, []);

  return { games, loading };
}
