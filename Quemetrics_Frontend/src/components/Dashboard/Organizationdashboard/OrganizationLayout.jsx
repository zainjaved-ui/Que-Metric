import { AuthContext } from '../../../contexts/AuthContext';
import React, { useState , useContext } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  FaChartLine,
  FaBars,
  FaTimes,
  FaSignOutAlt,
  FaHome,
  FaCalendarAlt,
  FaMapPin,
  FaCog,
  FaUsers,
  FaTrophy,
  FaChartBar,
  FaExclamationTriangle,
  FaFutbol,
  FaBuilding,
  FaListAlt
} from 'react-icons/fa';

import logo from '../../../assets/logo.png'; // adjust path if needed
import EmailVerificationBanner from '../../EmailVerificationBanner';
import { isVenueOwnerFeatureEnabled } from '../../../utils/featureFlags';
import { hasAnyRole } from '../../../utils/roles';

const DashboardLayout = () => {
  const { orgId } = useParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Organization menu items with distinct icons
  const menuItems = [
    {
      key: 'dashboard',
      icon: <FaHome className="h-5 w-5" />,
      label: 'Dashboard',
      path: `/organization/dashboard`
    },
    {
      key: 'tournaments',
      icon: <FaCalendarAlt className="h-5 w-5" />,
      label: 'Tournaments',
      path: `/organization/tournaments`
    },
    {
      key: 'venue-owners',
      icon: <FaMapPin className="h-5 w-5" />,
      label: 'Venue Owners',
      path: `/organization/venue-owners`
    },
    {
      key: 'seasons',
      icon: <FaCalendarAlt className="h-5 w-5" />,
      label: 'Seasons',
      path: `/organization/seasons`
    },
    {
      key: 'leaguemanagement',
      icon: <FaListAlt className="h-5 w-5" />,
      label: 'League Management',
      path: `/organization/leaguemanagement`
    },
    {
      key: 'disputed-matches',
      icon: <FaExclamationTriangle className="h-5 w-5" />,
      label: 'Disputed Matches',
      path: `/organization/disputedmatches`
    },

    {
      key: 'League-Match-Management',
      icon: <FaFutbol className="h-5 w-5" />,
      label: 'League Match Management',
      path: `/organization/leaguematchmanagement`
    },
    {
      key: 'Tournament-Match-Management',
      icon: <FaTrophy className="h-5 w-5" />,
      label: 'Tournament Match Management',
      path: `/organization/tournamentmatchmanagement`
    },
    {
      key: 'League-Stats',
      icon: <FaChartBar className="h-5 w-5" />,
      label: 'League Stats',
      path: `/organization/leaguestats`
    },
    {
      key: 'Club-Management',
      icon: <FaBuilding className="h-5 w-5" />,
      label: 'Club Management',
      path: `/organization/clubmanagement`
    },
    // ...(isVenueOwnerFeatureEnabled && hasAnyRole(user, ['venue_owner'])
    //   ? [{
    //       key: 'venue-owner-dashboard',
    //       icon: <FaMapPin className="h-5 w-5" />,
    //       label: 'Venue Owner Dashboard',
    //       path: `/venue-owner/dashboard`
    //     }]
    //   : [])
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <div className="min-h-screen flex">
      {/* Mobile Header (fixed) */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-[#132F45] p-4 flex items-center z-20 shadow-md">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-[#FFFBF4] p-2 rounded-lg hover:bg-[#1A3F5C] transition-colors"
          aria-label="Open menu"
        >
          <FaBars className="h-5 w-5" />
        </button>
        <div className="flex-1 flex justify-end">
          <img src={logo} alt="Cuemetrics" className="h-8 w-auto" />
        </div>
      </div>

      {/* Desktop Sidebar (always visible) */}
      <aside className="hidden lg:flex flex-col w-64 bg-[#132F45] fixed left-0 top-0 h-screen z-30 shadow-xl">
        {/* Logo */}
        <div className="w-full flex items-center justify-center py-4">
          <Link to="/" className="block">
            <img src={logo} alt="Cuemetrics" className="w-40 lg:w-50 h-auto" />
          </Link>
        </div>

        {/* Navigation with custom scrollbar */}
        <nav className="sidebar-nav flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
            <Link
              key={item.key}
              to={item.path}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
                isActive(item.path)
                  ? 'bg-[#1A3F5C] text-[#FFFBF4] shadow-sm'
                  : 'text-[#D1D5DB] hover:bg-[#1A3F5C]/80 hover:text-[#FFFBF4]'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="font-medium text-sm">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* User Info Section */}
        <div className="px-6 py-4 border-t border-[#1A3F5C] bg-[#1A3F5C]/30">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-full bg-[#BA995D] flex items-center justify-center text-[#FFFBF4] font-bold text-lg shadow-inner">
              {(user?.playerName || user?.organizationName || user?.venueOwnerName || user?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[#FFFBF4] font-bold text-sm truncate">
                {user?.playerName || user?.organizationName || user?.venueOwnerName || user?.name || 'User'}
              </span>
              <span className="text-[#D1D5DB] text-xs truncate">
                {user?.email || ''}
              </span>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <div className="p-4 border-t border-[#1A3F5C]">
          <button
            onClick={handleLogout}
            className="flex items-center justify-center space-x-2 w-full px-3 py-2.5 bg-[#1A3F5C] text-[#FFFBF4] rounded-md hover:bg-[#234764] transition-colors text-sm font-medium"
          >
            <FaSignOutAlt className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar (slides in) – fully scrollable, logo on right */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-full max-w-xs bg-[#132F45] transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out lg:hidden flex flex-col overflow-y-auto shadow-xl`}
      >
        {/* Header: close button left, logo right */}
        <div className="flex items-center justify-between p-4 border-b border-[#1A3F5C]">
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-[#FFFBF4] hover:text-[#D1D5DB] p-2 rounded-lg hover:bg-[#1A3F5C] transition-colors"
            aria-label="Close menu"
          >
            <FaTimes className="h-5 w-5" />
          </button>
          <Link to="/" onClick={() => setSidebarOpen(false)}>
            <img src={logo} alt="Cuemetrics" className="h-8 w-auto" />
          </Link>
        </div>


        {/* Navigation – compact, with custom scrollbar */}
        <nav className="sidebar-nav flex-1 px-2 py-2 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
            <Link
              key={item.key}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center space-x-3 px-2 py-1.5 rounded-md transition-all duration-200 ${
                isActive(item.path)
                  ? 'bg-[#1A3F5C] text-[#FFFBF4] shadow-sm'
                  : 'text-[#D1D5DB] hover:bg-[#1A3F5C]/80 hover:text-[#FFFBF4]'
              }`}
            >
              {/* Smaller icons on mobile */}
              <span className="text-sm">{React.cloneElement(item.icon, { className: 'h-4 w-4' })}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* User Info Section (Mobile) */}
        <div className="px-6 py-5 border-t border-[#1A3F5C] bg-[#1A3F5C]/30">
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 rounded-full bg-[#BA995D] flex items-center justify-center text-[#FFFBF4] font-bold text-xl shadow-inner">
              {(user?.playerName || user?.organizationName || user?.venueOwnerName || user?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[#FFFBF4] font-bold text-base truncate">
                {user?.playerName || user?.organizationName || user?.venueOwnerName || user?.name || 'User'}
              </span>
              <span className="text-[#D1D5DB] text-sm truncate">
                {user?.email || ''}
              </span>
            </div>
          </div>
        </div>

        {/* Logout – now part of natural flow (no absolute) */}
        <div className="p-4 border-t border-[#1A3F5C]">
          <button
            onClick={handleLogout}
            className="flex items-center justify-center space-x-2 w-full px-3 py-2 bg-[#1A3F5C] text-[#FFFBF4] rounded-md hover:bg-[#234764] transition-colors text-xs font-medium"
          >
            <FaSignOutAlt className="h-3 w-3" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:ml-64">
        <main className="flex-1 p-4 sm:p-5 lg:p-6 bg-[#FFFBF4] overflow-y-auto lg:mt-0 mt-[72px]">
          <div className="max-w-6xl mx-auto w-full">
            <EmailVerificationBanner user={user} />
            {/* Pass orgId to child routes via context */}
            <Outlet context={{ orgId }} />
          </div>
        </main>
      </div>

      {/* Custom scrollbar styles for the sidebar */}
      <style>{`
        .sidebar-nav::-webkit-scrollbar {
          width: 6px;
        }
        .sidebar-nav::-webkit-scrollbar-track {
          background: #1A3F5C; /* slightly lighter than sidebar background */
          border-radius: 4px;
        }
        .sidebar-nav::-webkit-scrollbar-thumb {
          background: #2C5A7A; /* medium tone between #132F45 and #1A3F5C */
          border-radius: 4px;
        }
        .sidebar-nav::-webkit-scrollbar-thumb:hover {
          background: #3F6B8F; /* lighter on hover */
        }
        /* For Firefox */
        .sidebar-nav {
          scrollbar-width: thin;
          scrollbar-color: #2C5A7A #1A3F5C;
        }
      `}</style>
    </div>
  );
};

export default DashboardLayout;