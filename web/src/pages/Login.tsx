import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { useAuth } from '../hooks/useAuth';
import { CURRENCY } from '../config/constants';

function friendlyError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
      case 'auth/invalid-email':
        return 'Wrong email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts — try again in a bit.';
      case 'auth/network-request-failed':
        return 'Network error — check your connection.';
    }
  }
  return 'Could not sign in. Please try again.';
}

export default function Login() {
  const { fbUser, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && fbUser) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-paper to-milk-100 text-3xl shadow-card ring-1 ring-ink/10 dark:from-ink/10 dark:to-ink/[0.03]">
            {CURRENCY.symbol}
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Milk Market</h1>
          <p className="mt-1 text-sm text-ink/50">A play-money prediction market.</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-3 rounded-3xl border border-ink/[0.06] bg-paper/80 p-7 shadow-pop backdrop-blur-xl"
        >
          <label className="block">
            <span className="text-xs font-medium text-ink/60">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jacob@milkmarket.local"
              className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink/60">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
            />
          </label>

          {error && <p className="text-sm text-no">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-paper hover:bg-ink/90 disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-ink/40">
          Accounts are pre-created. Ask Victor if you can’t get in.
        </p>
      </div>
    </div>
  );
}
