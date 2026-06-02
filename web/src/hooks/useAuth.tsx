import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FbUser,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

interface AuthContextValue {
  fbUser: FbUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [fbUser, setFbUser] = useState<FbUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase web persists the session locally by default → survives reloads (AC-A2.1).
    return onAuthStateChanged(auth, (u) => {
      setFbUser(u);
      setLoading(false);
    });
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };
  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ fbUser, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
