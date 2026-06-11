import { AuthContext } from '../../../contexts/AuthContext';
import React, { useState , useContext } from 'react';
import { Link, Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  FaChartLine,
  FaBars,
  FaTimes,
  FaSignOutAlt,
  FaHome,
  FaUser,
  FaTrophy,
  FaCalendarAlt,
  FaUsers,
  FaChartBar,
  FaMedal
} from 'react-icons/fa';

import logo from '../../../assets/logo.png';
import EmailVerificationBanner from '../../EmailVerificationBanner';
import { PlayerSportBookingProvider } from './player-flow/PlayerSportBookingContext';
import { isVenueOwnerFeatureEnabled } from '../../../utils/featureFlags';
import { hasAnyRole } from '../../../utils/roles';

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, switchRole } = useContext(AuthContext);
  const navigate = useNavigate();
  const [switchingRole, setSwitchingRole] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const playerMenuItems = [
    { label: 'Dashboard', icon: <FaHome className="h-[1.1rem] w-[1.1rem]" />, path: '/player/dashboard' },
    { label: 'Book Table', icon: <FaCalendarAlt className="h-[1.1rem] w-[1.1rem]" />, path: '/player/bookingtable' },
    { label: 'My Bookings', icon: <FaTrophy className="h-[1.1rem] w-[1.1rem]" />, path: '/player/mybookings' },
    { label: 'Find Matches', icon: <FaUsers className="h-[1.1rem] w-[1.1rem]" />, path: '/player/matchlisting' },
    { label: 'Upload Score', icon: <FaChartBar className="h-[1.1rem] w-[1.1rem]" />, path: '/player/uploadscore' },
    { label: 'My Clubs', icon: <FaUsers className="h-[1.1rem] w-[1.1rem]" />, path: '/player/clubs' },
    { label: 'My Profile', icon: <FaUser className="h-[1.1rem] w-[1.1rem]" />, path: '/player/profile' },
    { label: 'My Results', icon: <FaChartLine className="h-[1.1rem] w-[1.1rem]" />, path: '/player/results' },
    { label: 'All Leagues', icon: <FaTrophy className="h-[1.1rem] w-[1.1rem]" />, path: '/player/leagues' },
    // { label: 'Dashboard', icon: <FaHome className="h-5 w-5" />, path: '/player/dashboard' },
    // { label: 'Booking Table', icon: <FaCalendarAlt className="h-5 w-5" />, path: '/player/bookingtable' },
    // { label: 'My Bookings', icon: <FaTrophy className="h-5 w-5" />, path: '/player/mybookings' },
    // { label: 'Match Listing', icon: <FaUsers className="h-5 w-5" />, path: '/player/matchlisting' },
    // { label: 'My Tournament Matches', icon: <FaTrophy className="h-5 w-5" />, path: '/player/tournament-matches' },
    // { label: 'Upload Score', icon: <FaChartBar className="h-5 w-5" />, path: '/player/uploadscore' },
    // { label: 'Clubs', icon: <FaUsers className="h-5 w-5" />, path: '/player/clubs' },
    // { label: 'Profile', icon: <FaUser className="h-5 w-5" />, path: '/player/profile' },
    // { label: 'Results', icon: <FaChartLine className="h-5 w-5" />, path: '/player/results' },
    { label: 'Rankings', icon: <FaChartLine className="h-5 w-5" />, path: '/player/rankings' },
    { label: 'Honors', icon: <FaMedal className="h-5 w-5" />, path: '/player/honors' },
    // { label: 'Leagues', icon: <FaUsers className="h-5 w-5" />, path: '/player/leagues' },
    { label: 'All Tournaments', icon: <FaTrophy className="h-5 w-5" />, path: '/player/tournaments' },
    { label: 'My Tournaments', icon: <FaCalendarAlt className="h-5 w-5" />, path: '/player/my-tournaments' },
    // ...(isVenueOwnerFeatureEnabled && hasAnyRole(user, ['venue_owner'])
    //   ? [{ label: 'Venue Dashboard', icon: <FaMedal className="h-5 w-5" />, path: '/venue-owner/dashboard' }]
    //   : []),
  ];

  const roleConfig = {
    player: { label: 'Player', path: '/player/dashboard' },
    organization: { label: 'Organizer', path: '/organization/dashboard' },
    venue_owner: { label: 'Venue Owner', path: '/venue-owner/dashboard' },
    super_admin: { label: 'Admin', path: '/admin/dashboard' },
  };

  const roleSwitchItems = Array.isArray(user?.availableRoles)
    ? user.availableRoles
        .map((roleItem) => (typeof roleItem === 'string' ? { role: roleItem } : roleItem))
        .filter((roleItem) => roleItem?.role && roleItem.role !== user?.role)
        .map((roleItem) => ({
          role: roleItem.role,
          label: roleConfig[roleItem.role]?.label || roleItem.role,
          path: roleConfig[roleItem.role]?.path || '/',
        }))
    : [];

  const getNavLinkClasses = ({ isActive }) =>
    `group flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 relative overflow-hidden ${
      isActive
        ? 'bg-white/10 text-white shadow-lg'
        : 'text-white/40 hover:bg-white/5 hover:text-white/80'
    }`;

  const mobileNavLinkClasses = ({ isActive }) =>
    `group flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 relative ${
      isActive
        ? 'bg-white/10 text-white shadow-md'
        : 'text-white/40 hover:bg-white/5 hover:text-white/80'
    }`;

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

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-[#132F45] fixed left-0 top-0 h-screen z-30 shadow-2xl shadow-black/30 border-r border-white/5">
        {/* Logo Area */}
        <div className="px-6 py-6 border-b border-white/5">
          <Link to="/" className="block">
            <img src={logo} alt="Cuemetrics" className="w-32 h-auto" />
          </Link>
        </div>


        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20 px-4 mb-2.5">Navigation</p>
          {playerMenuItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              className={getNavLinkClasses}
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#BA995D] rounded-full" />}
                  <span className={`text-[14px] shrink-0 transition-colors ${isActive ? 'text-[#BA995D]' : 'text-white/30 group-hover:text-white/60'}`}>{item.icon}</span>
                  <span className="font-black text-[10px] uppercase tracking-normal">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}

          {roleSwitchItems.length > 0 && (
            <div className="pt-4 mt-4 border-t border-white/5">
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20 px-4 mb-2.5">Switch Role</p>
              <div className="space-y-1">
                {roleSwitchItems.map((item) => (
                  <button
                    key={item.role}
                    type="button"
                    onClick={async () => {
                      setSwitchingRole(true);
                      await switchRole(item.role);
                      setSwitchingRole(false);
                      setSidebarOpen(false);
                    }}
                    disabled={switchingRole}
                    className="group flex w-full items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 relative overflow-hidden text-white/40 hover:bg-white/5 hover:text-white/80 disabled:opacity-60"
                  >
                    <span className="text-[14px] shrink-0 transition-colors text-white/30 group-hover:text-white/60">
                      <FaChartLine className="h-[1.1rem] w-[1.1rem]" />
                    </span>
                    <span className="font-black text-[10px] uppercase tracking-normal">Switch to {item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* User Info Section */}
        <div className="px-6 py-4 border-t border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#BA995D] flex items-center justify-center text-white font-bold text-lg shadow-inner">
              {(user?.playerName || user?.organizationName || user?.venueOwnerName || user?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-white font-black text-[11px] uppercase tracking-wider truncate">
                {user?.playerName || user?.organizationName || user?.venueOwnerName || user?.name || 'User'}
              </span>
              <span className="text-white/40 text-[9px] truncate">
                {user?.email || ''}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-3 w-full px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl transition-all text-[9px] font-black uppercase tracking-[0.2em] border border-white/5 hover:border-white/10"
          >
            <FaSignOutAlt className="h-3 w-3" />
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

      {/* Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-full max-w-[16rem] bg-[#132F45] transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out lg:hidden flex flex-col overflow-y-auto shadow-2xl border-r border-white/5`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <Link to="/" onClick={() => setSidebarOpen(false)}>
            <img src={logo} alt="Cuemetrics" className="h-8 w-auto" />
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-white/40 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors"
            aria-label="Close menu"
          >
            <FaTimes className="h-5 w-5" />
          </button>
        </div>


        <nav className="flex-1 px-4 py-6 space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 px-4 mb-4">Navigation</p>
          {playerMenuItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={mobileNavLinkClasses}
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-[#BA995D] rounded-full" />}
                  <span className={`text-sm shrink-0 ${isActive ? 'text-[#BA995D]' : 'text-white/30'}`}>
                    {React.cloneElement(item.icon, { className: 'h-4 w-4' })}
                  </span>
                  <span className="font-black text-[11px] uppercase tracking-[0.15em]">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}

          {roleSwitchItems.length > 0 && (
            <div className="pt-4 mt-4 border-t border-white/5">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 px-4 mb-4">Switch Role</p>
              <div className="space-y-1">
                {roleSwitchItems.map((item) => (
                  <button
                    key={item.role}
                    type="button"
                    onClick={async () => {
                      setSwitchingRole(true);
                      await switchRole(item.role);
                      setSwitchingRole(false);
                      setSidebarOpen(false);
                    }}
                    disabled={switchingRole}
                    className="group flex w-full items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 relative text-white/40 hover:bg-white/5 hover:text-white/80 disabled:opacity-60"
                  >
                    <span className="text-sm shrink-0 text-white/30">
                      <FaChartLine className="h-4 w-4" />
                    </span>
                    <span className="font-black text-[11px] uppercase tracking-[0.15em]">Switch to {item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* User Info Section (Mobile) */}
        <div className="px-6 py-5 border-t border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#BA995D] flex items-center justify-center text-white font-bold text-lg shadow-inner">
              {(user?.playerName || user?.organizationName || user?.venueOwnerName || user?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-white font-black text-[12px] uppercase tracking-wider truncate">
                {user?.playerName || user?.organizationName || user?.venueOwnerName || user?.name || 'User'}
              </span>
              <span className="text-white/40 text-[10px] truncate">
                {user?.email || ''}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-[0.2em]"
          >
            <FaSignOutAlt className="h-3.5 w-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:ml-64">
        <main className="flex-1 p-4 sm:p-5 lg:p-6 bg-[#FFFBF4] overflow-y-auto lg:mt-0 mt-18">
          <div className="max-w-6xl mx-auto w-full">
            <EmailVerificationBanner user={user} />
            <PlayerSportBookingProvider>
              <Outlet />
            </PlayerSportBookingProvider>
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;