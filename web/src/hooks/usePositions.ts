import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Position, PositionDoc } from '../lib/types';

/** Live list of a user's positions (defaults to no fetch when uid is falsy). */
export function usePositions(uid: string | undefined) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setPositions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'positions'), where('uid', '==', uid));
    return onSnapshot(q, (snap) => {
      setPositions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as PositionDoc) })));
      setLoading(false);
    });
  }, [uid]);

  return { positions, loading };
}
