import React from "react";
import snookerImg from "../../assets/snooker.png";
import poolImg from "../../assets/pool.png";
import pokerImg from "../../assets/pooker.png";

const Sports = () => {
  const sports = [
    {
      image: snookerImg,
      name: "Snooker",
      description:
        "Comprehensive frame tracking, break building statistics, and snooker-specific performance metrics."
    },
    {
      image: poolImg,
      name: "Pool",
      description:
        "Rack management, game formats, and pool-specific statistics including runouts and safety success rates."
    },
    {
      image: pokerImg,
      name: "Poker",
      description:
        "Tournament management, hand tracking, blind structures, and poker-specific performance analytics."
    }
  ];

  return (
    <section id="sports" className="py-16 md:py-24 bg-[#FFFBF4]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {sports.map((sport, index) => (
            <div key={index} className="relative group">
              <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-3 border border-[#D1D5DB] relative z-10">

                <div className="relative mb-8 flex justify-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#132F45] to-[#1A3F5C] rounded-full blur-lg opacity-30 group-hover:opacity-50 transition-opacity"></div>

                  <div className="h-28 w-28 bg-gradient-to-br from-[#132F45] to-[#1A3F5C] rounded-full flex items-center justify-center relative z-10 transform group-hover:scale-110 transition-transform duration-500">
                    <img
                      src={sport.image}
                      alt={sport.name}
                      className="h-16 w-16 object-contain"
                    />
                  </div>

                  <div className="absolute -top-2 -right-2 bg-[#132F45] text-[#FFFBF4] text-xs font-bold px-3 py-1 rounded-full">
                    #{index + 1}
                  </div>
                </div>

                <h3 className="text-2xl font-bold text-center text-[#132F45] mb-4">
                  {sport.name}
                </h3>

                <p className="text-[#132F45] opacity-90 text-center leading-relaxed">
                  {sport.description}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};

export default Sports;
