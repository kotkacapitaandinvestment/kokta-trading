import { Navigate } from 'react-router-dom';
import { useAuth, needsVerification } from '../context/AuthContext';
import { useAppConfig } from '../context/AppConfigContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  const config = useAppConfig();
  if (loading || !config.loaded) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (needsVerification(user, config)) return <Navigate to="/verify" replace />;
  return children;
}
