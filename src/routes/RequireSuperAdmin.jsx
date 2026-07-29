import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RequireSuperAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role !== 'super_admin') return <Navigate to="/admin/overview" replace />;
  return children;
}
