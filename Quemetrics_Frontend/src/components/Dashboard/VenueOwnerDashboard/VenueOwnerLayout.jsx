import React, { useState, useContext } from 'react';
import { Link, Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  FaChartLine,
  FaHome,
  FaUser,
  FaEnvelope,
  FaBars,
  FaTimes,
  FaSignOutAlt,
  FaCalendarAlt,
  FaTable,
  FaClock,
  FaList,
  FaBook,
  FaPlusCircle
} from 'react-icons/fa';
import { AuthContext } from '../../../contexts/AuthContext';
import { VenueOwnerContext } from '../../../contexts/VenueOwnerContext';
import logo from '../../../assets/logo.png';

const VenueOwnerLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, switchRole } = useContext(AuthContext);
  const { venueOwner, getProfile } = useContext(VenueOwnerContext);
  const navigate = useNavigate();
  const [switchingRole, setSwitchingRole] = useState(false);

  React.useEffect(() => {
    if (!venueOwner) {
      getProfile();
    }
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    {
      key: 'dashboard',
      icon: <FaHome className="h-5 w-5" />,
      label: 'Dashboard',
      path: '/venue-owner/dashboard'
    },
    {
      key: 'my-tables',
      icon: <FaTable className="h-5 w-5" />,
      label: 'My Tables',
      path: '/venue-owner/my-tables'
    },
    {
      key: 'slot-availability',
      icon: <FaClock className="h-5 w-5" />,
      label: 'Slot Availability',
      path: '/venue-owner/slot-availability'
    },
    {
      key: 'all-bookings',
      icon: <FaList className="h-5 w-5" />,
      label: 'All Bookings',
      path: '/venue-owner/all-bookings'
    },
    {
      key: 'my-bookings',
      icon: <FaBook className="h-5 w-5" />,
      label: 'My Bookings',
      path: '/venue-owner/my-bookings'
    },
    {
      key: 'new-booking',
      icon: <FaPlusCircle className="h-5 w-5" />,
      label: 'New Booking',
      path: '/venue-owner/new-booking'
    },
    {
      key: 'league-requests',
      icon: <FaCalendarAlt className="h-5 w-5" />,
      label: 'League Requests',
      path: '/venue-owner/league-requests'
    },
    {
      key: 'tournament-requests',
      icon: <FaEnvelope className="h-5 w-5" />,
      label: 'Tournament Requests',
      path: '/venue-owner/tournament-request'
    },
    {
      key: 'profile',
      icon: <FaUser className="h-5 w-5" />,
      label: 'Profile',
      path: '/venue-owner/profile'
    },

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

      {/* Desktop Sidebar (always visible) */}
      <aside className="hidden lg:flex flex-col w-64 bg-[#132F45] fixed left-0 top-0 h-screen z-30 shadow-2xl shadow-black/30 border-r border-white/5">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-white/5">
          <Link to="/" className="block">
            <img src={logo} alt="Cuemetrics" className="w-32 h-auto" />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto no-scrollbar">
          <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20 px-4 mb-3">Unit Management</p>
          {navItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              className={getNavLinkClasses}
              end={item.path === '/venue-owner/dashboard'}
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#BA995D] rounded-full" />}
                  <span className={`text-[14px] flex-shrink-0 transition-colors ${isActive ? 'text-[#BA995D]' : 'text-white/30 group-hover:text-white/60'}`}>{item.icon}</span>
                  <span className="font-black text-[10px] uppercase tracking-normal mt-0.5">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}

          {roleSwitchItems.length > 0 && (
            <div className="pt-4 mt-4 border-t border-white/5">
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20 px-4 mb-3">Switch Role</p>
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
                    <span className="text-[14px] flex-shrink-0 transition-colors text-white/30 group-hover:text-white/60">
                      <FaChartLine className="h-[1.1rem] w-[1.1rem]" />
                    </span>
                    <span className="font-black text-[10px] uppercase tracking-normal mt-0.5">Switch to {item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* User Info Section */}
        <div className="px-6 py-4 border-t border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#BA995D] flex items-center justify-center text-white font-black text-lg shadow-inner">
              {(venueOwner?.name || user?.playerName || user?.organizationName || user?.venueOwnerName || user?.name || 'V').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-white font-black text-[11px] uppercase tracking-wider truncate">
                {venueOwner?.name || user?.playerName || user?.organizationName || user?.venueOwnerName || user?.name || 'Operator'}
              </span>
              <span className="text-white/40 text-[9px] truncate">
                {venueOwner?.email || user?.email || ''}
              </span>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <div className="p-4 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-3 w-full px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl transition-all text-[9px] font-black uppercase tracking-[0.2em] border border-white/5 hover:border-white/10"
          >
            <FaSignOutAlt className="h-3 w-3" />
            <span>Terminate Session</span>
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

      {/* Mobile Sidebar (slides in) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-full max-xs bg-[#132F45] transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
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


        {/* Navigation – compact */}
        <nav className="flex-1 px-2 py-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={mobileNavLinkClasses}
              end={item.path === '/venue-owner/dashboard'}
            >
              {/* Smaller icons on mobile */}
              <span className="text-sm">{React.cloneElement(item.icon, { className: 'h-4 w-4' })}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </NavLink>
          ))}

          {roleSwitchItems.length > 0 && (
            <div className="pt-4 mt-4 border-t border-[#1A3F5C]">
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
                    className="flex w-full items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 relative text-white/40 hover:bg-white/5 hover:text-white/80 disabled:opacity-60"
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
        <div className="px-6 py-5 border-t border-[#1A3F5C] bg-[#1A3F5C]/30">
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 rounded-full bg-[#BA995D] flex items-center justify-center text-[#FFFBF4] font-bold text-xl shadow-inner">
              {(venueOwner?.name || user?.playerName || user?.organizationName || user?.venueOwnerName || user?.name || 'V').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[#FFFBF4] font-bold text-base truncate">
                {venueOwner?.name || user?.playerName || user?.organizationName || user?.venueOwnerName || user?.name || 'Operator'}
              </span>
              <span className="text-[#D1D5DB] text-sm truncate">
                {venueOwner?.email || user?.email || ''}
              </span>
            </div>
          </div>
        </div>

        {/* Logout */}
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
      <div className="flex-1 flex flex-col lg:ml-64 w-full">
        <main className="flex-1 p-0 bg-[#FAFAFA] overflow-y-auto lg:mt-0 mt-[64px] min-h-0">
          <div className="w-full h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default VenueOwnerLayout;