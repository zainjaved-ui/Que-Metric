import React from 'react';
import { FaTrophy, FaUserFriends, FaCalendarAlt, FaChartPie, FaVideo, FaMobileAlt } from 'react-icons/fa';

const Features = () => {
  const features = [
    {
      icon: <FaTrophy className="h-12 w-12" />,
      title: "League & Tournament Management",
      description: "Create and manage leagues, divisions, and tournaments with custom formats including round robin and knockout systems."
    },
    {
      icon: <FaUserFriends className="h-12 w-12" />,
      title: "Player Management",
      description: "Handle player registrations, profiles, and comprehensive sport-specific statistics tracking with career progression."
    },
    {
      icon: <FaCalendarAlt className="h-12 w-12" />,
      title: "Booking & Scheduling",
      description: "Manage table bookings, time slots, and fixtures with conflict prevention and calendar views for seamless scheduling."
    },
    {
      icon: <FaChartPie className="h-12 w-12" />,
      title: "Advanced Statistics",
      description: "Track comprehensive player and league statistics with filterable reports and exportable data for analysis."
    },
    {
      icon: <FaVideo className="h-12 w-12" />,
      title: "Match Video Integration",
      description: "Link recorded match footage to player profiles and matches for analysis and review (recorded footage only)."
    },
    {
      icon: <FaMobileAlt className="h-12 w-12" />,
      title: "Cross-Platform Mobile App",
      description: "Access all platform features through a single codebase mobile app that works on both iOS and Android devices."
    }
  ];

  return (
    <section id="features" className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-[#132F45] mb-4">Platform Features</h2>
          <div className="w-16 h-1 bg-[#132F45] mx-auto mb-6"></div>
          <p className="text-lg text-[#132F45] opacity-90">
            Comprehensive tools designed specifically for cue sports league management
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="bg-[#FFFBF4] rounded-xl p-8 border-t-4 border-[#132F45] hover:transform hover:-translate-y-2 hover:shadow-xl transition-all duration-300 group border border-[#D1D5DB]"
            >
              <div className="text-[#132F45] mb-6 group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-[#132F45] mb-4">{feature.title}</h3>
              <p className="text-[#132F45] opacity-90">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;