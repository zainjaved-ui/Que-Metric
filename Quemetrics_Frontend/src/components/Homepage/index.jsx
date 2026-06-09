import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Hero from './Hero';
import Features from './Features';
import Sports from './Sports';
// import CTA from './CTA';
import Clubs from './Clubs';
import Rankings from './Ranking';

const Homepage = () => {
  const navigate = useNavigate();

  // ✅ Auto-redirect to dashboard if user is already logged in
  useEffect(() => {
    // Check localStorage first (Remember Me = checked)
    let userData = localStorage.getItem('user');

    // If not in localStorage, check sessionStorage (Remember Me = unchecked)
    if (!userData) {
      userData = sessionStorage.getItem('user');
    }

    if (userData) {
      try {
        const user = JSON.parse(userData);
        console.log('[Homepage] ✅ User already logged in, redirecting to dashboard:', user.role);

        // Map role to dashboard path
        const roleRoutes = {
          player: '/player/dashboard',
          organization: '/organization/dashboard',
          venue_owner: '/venue-owner/dashboard',
          super_admin: '/admin/dashboard',
        };

        const dashboardPath = roleRoutes[user.role] || '/player/dashboard';
        navigate(dashboardPath, { replace: true });
      } catch (error) {
        console.error('[Homepage] Error parsing user data:', error);
        // Continue showing homepage if parse fails
      }
    }
  }, [navigate]);

  return (
    <>
      <main>
        <Hero />
        <Features />
        <Sports />
        {/* <CTA /> */}
        <Clubs />
        <Rankings />
      </main>
    </>
  );
};

export default Homepage;