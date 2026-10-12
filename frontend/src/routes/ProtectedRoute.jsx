import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

/**
 * Guards a route so only authenticated users can access it.
 * If the user must change their password they are sent to /change-password
 * regardless of which protected route they tried to visit — EXCEPT if they
 * are already on /change-password (avoids an infinite redirect loop).
 */
export default function ProtectedRoute({ children, allowMustChange = false }) {
  const { user } = useContext(AuthContext);

  if (!user) return <Navigate to="/login" replace />;

  if (user.mustChangePassword && !allowMustChange) {
    return <Navigate to="/change-password" replace />;
  }

  return children;
}
