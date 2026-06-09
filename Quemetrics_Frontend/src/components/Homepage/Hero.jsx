import React, { useContext } from 'react';
import { FaChartBar, FaArrowRight } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';

const Hero = () => {
  const { user } = useContext(AuthContext);

  const getDashboardPath = () => {
    if (!user) return '/login';
    switch(user.role) {
      case 'player': return '/player/dashboard';
      case 'organization': return '/organization/dashboard';
      case 'venue_owner': return '/venue-owner/dashboard';
      case 'super_admin': return '/admin/dashboard';
      default: return '/login';
    }
  };

  return (
    <section id="home" className="bg-gradient-to-br from-[#FFFBF4] to-[#F5F0E8]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-7 md:py-7">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#132F45] mb-6 leading-tight">
              Streamline Your Cue Sports League Management
            </h1>
            <p className="text-lg text-[#132F45] opacity-90 mb-8 max-w-2xl">
              Cuemetrics is the all-in-one SaaS platform designed specifically for snooker, pool, and pooker leagues. 
              Manage tournaments, track player statistics, handle bookings, and streamline league operations—all in one place.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              {user ? (
                <Link 
                  to={getDashboardPath()} 
                  className="px-8 py-3 bg-[#132F45] text-[#FFFBF4] rounded-lg font-semibold hover:bg-[#0A2030] hover:transform hover:-translate-y-1 transition-all duration-300 shadow-lg flex items-center justify-center gap-2 text-center"
                >
                  Go to Dashboard
                  <FaArrowRight />
                </Link>
              ) : (
                <>
                  <Link 
                    to="/register/player" 
                    className="px-8 py-3 bg-[#132F45] text-[#FFFBF4] rounded-lg font-semibold hover:bg-[#0A2030] hover:transform hover:-translate-y-1 transition-all duration-300 shadow-lg flex items-center justify-center gap-2 text-center"
                  >
                    Get Started
                    <FaArrowRight />
                  </Link>
                  <Link 
                    to="/login"
                    className="px-8 py-3 border-2 border-[#132F45] text-[#132F45] rounded-lg font-semibold hover:bg-[#132F45] hover:text-[#FFFBF4] transition-all duration-300 text-center"
                  >
                    Log In
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Right Content - Dashboard Preview */}
          <div className="relative">
            <div className="bg-white rounded-xl shadow-xl p-8 transform hover:scale-[1.02] transition-all duration-300 border border-[#D1D5DB]">
              <div className="bg-gradient-to-br from-[#132F45] to-[#1A3F5C] rounded-lg p-6 text-white">
                <div className="flex items-center justify-center mb-6">
                  <FaChartBar className="h-12 w-12" />
                </div>
                <h3 className="text-2xl font-bold text-center mb-4">League Dashboard Preview</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Active Leagues</span>
                    <span className="font-bold">24</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Total Players</span>
                    <span className="font-bold">1,248</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Tournaments This Month</span>
                    <span className="font-bold">38</span>
                  </div>
                  <div className="pt-4 border-t border-white border-opacity-20">
                    <div className="text-center text-sm opacity-80">
                      Real-time statistics and analytics
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Decorative Elements */}
            <div className="absolute -top-4 -left-4 w-20 h-20 bg-[#132F45] rounded-full opacity-10 blur-xl"></div>
            <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-[#132F45] rounded-full opacity-10 blur-xl"></div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;