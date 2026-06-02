import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Loading from './Loading';
import Layout from './Layout';
import { HowItWorksProvider } from './HowItWorks';

/** Gate for signed-in users. Anonymous visitors are bounced to /login (AC-A1.3). */
export default function ProtectedRoute() {
  const { fbUser, loading } = useAuth();
  if (loading) return <Loading />;
  if (!fbUser) return <Navigate to="/login" replace />;
  // HowItWorks auto-opens once after login; Layout renders the nav + the matched page.
  return (
    <HowItWorksProvider>
      <Layout />
    </HowItWorksProvider>
  );
}
