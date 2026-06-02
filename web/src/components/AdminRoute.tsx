import { Navigate, Outlet } from 'react-router-dom';
import { useUser } from '../hooks/useUser';
import Loading from './Loading';

/** Gate for the admin (Victor). Non-admins are redirected home (AC-J1.1). */
export default function AdminRoute() {
  const { user, loading } = useUser();
  if (loading) return <Loading />;
  if (!user?.isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
