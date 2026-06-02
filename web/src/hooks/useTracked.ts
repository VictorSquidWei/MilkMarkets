import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TRACKED_PLAYER } from '../config/constants';

export interface Tracked {
  gameName: string;
  tagLine: string;
}

/** Live tracked LoL player (admin-editable via meta/tracked). Falls back to the default constant. */
export function useTracked(): Tracked {
  const [tracked, setTracked] = useState<Tracked>({ ...TRACKED_PLAYER });

  useEffect(() => {
    return onSnapshot(
      doc(db, 'meta', 'tracked'),
      (snap) => {
        const d = snap.exists() ? (snap.data() as Partial<Tracked>) : null;
        setTracked({
          gameName: d?.gameName || TRACKED_PLAYER.gameName,
          tagLine: d?.tagLine || TRACKED_PLAYER.tagLine,
        });
      },
      () => setTracked({ ...TRACKED_PLAYER }), // read denied / offline → fall back
    );
  }, []);

  return tracked;
}
