import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaMapMarkerAlt, 
  FaUsers, 
  FaCheckCircle,
  FaBuilding 
} from 'react-icons/fa';

const Clubs = () => {
  const navigate = useNavigate();

  const clubs = [
    { name: 'Berrow Social Club', location: 'Berrow, Somerset', members: 45, verified: true },
    { name: 'Highbridge Snooker Hall', location: 'Highbridge, Somerset', members: 38, verified: true },
    { name: 'Bristol Pool House', location: 'Bristol', members: 27, verified: false },
  ];

  return (
    <section className="bg-gradient-to-br from-[#FFFBF4] via-[#F8F5EF] to-[#EDE6DA] py-20 min-h-screen">
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-16 text-center">
          <h1 className="text-5xl font-extrabold text-[#132F45] mb-4 tracking-tight">
            Explore Clubs
          </h1>
          <p className="text-lg text-[#132F45]/70 max-w-2xl mx-auto">
            Discover registered clubs and premium venues. Verified clubs are eligible to host Tier 2 & Tier 3 events.
          </p>
        </div>

        {/* Clubs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {clubs.map((club, idx) => (
            <div
              key={idx}
              className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-500 border border-white/30 overflow-hidden group hover:-translate-y-2"
            >
              {/* Top Banner */}
              <div className="h-44 bg-gradient-to-r from-[#132F45] to-[#1A3F5C] flex items-center justify-center relative">
                <FaBuilding className="text-white text-7xl opacity-40 group-hover:scale-125 transition-transform duration-500" />
                
                {club.verified && (
                  <div className="absolute top-4 right-4 bg-green-500 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1 shadow-md">
                    <FaCheckCircle />
                    Verified
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-7">
                <h2 className="text-2xl font-bold text-[#132F45] mb-3">
                  {club.name}
                </h2>

                <div className="space-y-3 text-sm mb-6">
                  <div className="flex items-center gap-3 text-[#132F45]/70">
                    <FaMapMarkerAlt className="text-[#132F45]" />
                    <span>{club.location}</span>
                  </div>

                  <div className="flex items-center gap-3 text-[#132F45]/70">
                    <FaUsers className="text-[#132F45]" />
                    <span>
                      <span className="font-semibold text-[#132F45]">
                        {club.members}
                      </span> members
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => navigate('/login')}
                  className="w-full bg-gradient-to-r from-[#132F45] to-[#0A2030] text-white py-3 rounded-xl font-semibold tracking-wide hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  View Club →
                </button>
              </div>

              {/* Glow Hover Effect */}
              <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition duration-500 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none"></div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};

export default Clubs;
