import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import type { User, UserDoc } from '../lib/types';

/** Live snapshot of the signed-in user's own users/{uid} doc. */
export function useUser() {
  const { fbUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fbUser) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
      setUser(snap.exists() ? { uid: snap.id, ...(snap.data() as UserDoc) } : null);
      setLoading(false);
    });
  }, [fbUser]);

  return { user, loading };
}
