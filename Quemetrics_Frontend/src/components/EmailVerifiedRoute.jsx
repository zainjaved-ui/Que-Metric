import { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';

/**
 * EmailVerifiedRoute - Protects routes that require email verification
 * Allows access to dashboard routes, but restricts other pages
 */
export default function EmailVerifiedRoute({ children, redirectToDashboard = true }) {
  const { user } = useContext(AuthContext);
  const location = useLocation();

  // If email is not verified, redirect to appropriate dashboard
  if (user && !user.emailVerified) {
    if (!redirectToDashboard) {
      // Just show a message (used for nested routes that already show banner)
      return children;
    }

    // Redirect to role-based dashboard where they'll see the verification banner
    const dashboardRoutes = {
      player: '/player/dashboard',
      organization: '/organization/dashboard',
      venue_owner: '/venue-owner/dashboard',
      super_admin: '/admin/dashboard',
    };

    const dashboardPath = dashboardRoutes[user.role] || '/';

    // If they're already on the dashboard, let them see it
    if (location.pathname === dashboardPath) {
      return children;
    }

    // Redirect to dashboard with state
    return <Navigate to={dashboardPath} replace state={{
      message: 'Please verify your email to access all features.'
    }} />;
  }

  return children;
}
