import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { HelpCircle, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useUser } from '../hooks/useUser';
import { useTheme } from '../hooks/useTheme';
import { useHowItWorks } from './HowItWorks';
import { formatMilk } from '../lib/money';
import { CURRENCY } from '../config/constants';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1.5 text-sm font-medium transition ${
    isActive ? 'bg-ink text-paper shadow-sm' : 'text-ink/55 hover:bg-ink/[0.06] hover:text-ink'
  }`;

const iconBtn = 'rounded-full p-2 text-ink/45 transition hover:bg-ink/[0.06] hover:text-ink';

export default function Layout() {
  const { logout } = useAuth();
  const { user } = useUser();
  const { theme, toggle } = useTheme();
  const { open } = useHowItWorks();
  const navigate = useNavigate();

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-ink/[0.06] bg-paper/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-1.5 px-4 py-3">
          <NavLink to="/" className="mr-1 flex items-center gap-2" title="Milk Market">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-paper to-milk-100 text-lg shadow-sm ring-1 ring-ink/10 dark:from-ink/10 dark:to-ink/[0.03]">
              {CURRENCY.symbol}
            </span>
            <span className="hidden text-[15px] font-bold tracking-tight sm:inline">Milk Market</span>
          </NavLink>
          <nav className="flex items-center gap-0.5 overflow-x-auto">
            <NavLink to="/" end className={linkClass}>
              Markets
            </NavLink>
            <NavLink to="/portfolio" className={linkClass}>
              Portfolio
            </NavLink>
            <NavLink to="/leaderboard" className={linkClass}>
              Leaderboard
            </NavLink>
            {user?.isAdmin && (
              <NavLink to="/admin" className={linkClass}>
                Admin
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            {user && (
              <span className="tnum hidden rounded-full border border-ink/10 bg-paper px-3 py-1.5 text-sm font-semibold shadow-sm sm:inline">
                {formatMilk(user.balance)}
              </span>
            )}
            <button onClick={toggle} className={iconBtn} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={open} className={iconBtn} title="How it works">
              <HelpCircle size={18} />
            </button>
            <button
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className={iconBtn}
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
