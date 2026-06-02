import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Position, PositionDoc, User, UserDoc } from '../lib/types';

/** Live list of all users (leaderboard-relevant fields are world-readable). */
export function useAllUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserDoc) })));
      setLoading(false);
    });
  }, []);

  return { users, loading };
}

/** All positions across all users — used to mark-to-market the leaderboard (plan §11). */
export function useAllPositions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(collection(db, 'positions'), (snap) => {
      setPositions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as PositionDoc) })));
      setLoading(false);
    });
  }, []);

  return { positions, loading };
}
