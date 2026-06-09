import React, { useState, useContext } from 'react';
import { 
  FaBars, 
  FaTimes, 
  FaUser
} from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
// Replace the path below with the actual path to your logo image
import logo from '../../assets/logo.png';

const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const navItems = [
    { label: 'Home', href: '#home' },
    { label: 'Features', href: '#features' },
    { label: 'Sports', href: '#sports' },
    // Pricing and Contact removed
  ];

  const scrollToSection = (e, href) => {
    e.preventDefault();
    if (href.startsWith('#') && window.location.pathname === '/') {
      const element = document.querySelector(href);
      if (element) {
        const offset = 80;
        const elementPosition = element.offsetTop - offset;
        window.scrollTo({
          top: elementPosition,
          behavior: 'smooth'
        });
      }
    } else if (href.startsWith('#')) {
      navigate('/');
      setTimeout(() => {
        const element = document.querySelector(href);
        if (element) {
          const offset = 80;
          const elementPosition = element.offsetTop - offset;
          window.scrollTo({
            top: elementPosition,
            behavior: 'smooth'
          });
        }
      }, 100);
    }
    setMobileMenuOpen(false);
  };

  const getDashboardPath = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'player': return '/player/dashboard';
      case 'organization': return '/organization/dashboard';
      case 'venue_owner': return '/venue-owner/dashboard';
      case 'super_admin': return '/admin/dashboard';
      default: return '/login';
    }
  };

  return (
    <nav className="sticky top-0 z-50 bg-[#132F45] text-[#FFFBF4] shadow-lg border-b border-[#1A3F5C]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo (left) */}
          <Link to="/" className="flex items-center space-x-3 hover:opacity-90 transition-opacity group flex-none">
            <img src={logo} alt="Cuemetrics" className="h-16 w-auto" />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex flex-1 items-center justify-center">
            <div className="flex space-x-6">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => scrollToSection(e, item.href)}
                  className="text-[#FFFBF4] hover:text-white font-medium transition-colors duration-300 relative group py-2 px-5"
                >
                  {item.label}
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-[#FFFBF4] to-[#D1D5DB] transition-all duration-300 group-hover:w-full"></span>
                </a>
              ))}
            </div>
          </div>

          {/* Buttons (right) */}
          <div className="hidden md:flex items-center space-x-6 flex-none">
            <div className="h-6 w-px bg-[#1A3F5C] mx-2"></div>
            <Link
              to="/login"
              className="px-5 py-2.5 border border-[#FFFBF4] text-[#FFFBF4] rounded-lg hover:bg-[#FFFBF4] hover:text-[#132F45] transition-all duration-300 font-medium"
            >
              Log In
            </Link>
            <Link
              to="/register/player"
              className="px-5 py-2.5 bg-gradient-to-r from-[#FFFBF4] to-[#E8E2D9] text-[#132F45] rounded-lg hover:shadow-lg hover:transform hover:-translate-y-0.5 transition-all duration-300 font-semibold"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-[#FFFBF4] text-xl p-2 hover:bg-[#1A3F5C] rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#1A3F5C] border-t border-[#234764]">
            <div className="py-4">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => scrollToSection(e, item.href)}
                  className="block px-4 py-3 text-[#FFFBF4] hover:bg-[#234764] transition-colors border-l-2 border-transparent hover:border-[#FFFBF4]"
                >
                  {item.label}
                </a>
              ))}

              <div className="border-t border-[#234764] mt-3 pt-4 px-4">
                {user ? (
                  <Link
                    to={getDashboardPath()}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center space-x-2 w-full px-4 py-3 bg-gradient-to-r from-[#FFFBF4] to-[#E8E2D9] text-[#132F45] rounded-lg font-semibold"
                  >
                    <FaUser />
                    <span>Dashboard</span>
                  </Link>
                ) : (
                  <div className="space-y-3">
                    <Link
                      to="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block w-full text-center px-4 py-3 border border-[#FFFBF4] text-[#FFFBF4] rounded-lg hover:bg-[#FFFBF4] hover:text-[#132F45] transition-colors font-medium"
                    >
                      Log In
                    </Link>
                    <Link
                      to="/register/player"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block w-full text-center px-4 py-3 bg-gradient-to-r from-[#FFFBF4] to-[#E8E2D9] text-[#132F45] rounded-lg font-semibold"
                    >
                      Get Started Free
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;