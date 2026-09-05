import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Spinner from '../common/Spinner';

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
};

export default ProtectedRoute;
