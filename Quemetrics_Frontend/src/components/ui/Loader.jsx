import React from 'react';
import { motion } from 'framer-motion';

export default function Loader({ text = 'Synchronizing...' }) {
  // Animation variants for the billiard balls
  const ballVariants = {
    animate: (i) => ({
      scale: [1, 1.2, 1],
      opacity: [1, 0.4, 1],
      y: [0, -10, 0],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
        delay: i * 0.2,
      },
    }),
  };

  const containerVariants = {
    animate: {
      rotate: 360,
      transition: {
        duration: 8,
        repeat: Infinity,
        ease: "linear",
      },
    },
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#132F45]/80 backdrop-blur-xl">
      {/* Billiard Ball Group Animation */}
      <div className="relative w-24 h-24 mb-10">
        <motion.div
          className="w-full h-full relative"
          variants={containerVariants}
          animate="animate"
        >
          {/* Snooker Red Ball */}
          <motion.div
            custom={0}
            variants={ballVariants}
            animate="animate"
            className="absolute top-0 left-1/2 -ml-3 w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-red-900 shadow-lg shadow-red-500/30"
          >
            <div className="absolute top-1 left-1.5 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]" />
          </motion.div>

          {/* Pool Gold Ball */}
          <motion.div
            custom={1}
            variants={ballVariants}
            animate="animate"
            className="absolute bottom-0 left-0 w-6 h-6 rounded-full bg-gradient-to-br from-[#BA995D] to-[#8c7144] shadow-lg shadow-[#BA995D]/30"
          >
            <div className="absolute top-1 left-1.5 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]" />
          </motion.div>

          {/* Pooker/Tournament Deep Blue Ball */}
          <motion.div
            custom={2}
            variants={ballVariants}
            animate="animate"
            className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-900 shadow-lg shadow-blue-500/30"
          >
            <div className="absolute top-1 left-1.5 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]" />
          </motion.div>
        </motion.div>
        
        {/* Central 'Cue Ball' pulsing light */}
        <motion.div 
            animate={{ scale: [1, 1.5, 1], opacity: [0.1, 0.3, 0.1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute top-1/2 left-1/2 -ml-4 -mt-4 w-8 h-8 rounded-full bg-white blur-xl"
        />
      </div>

      {/* High-Density Loading Text */}
      <div className="text-center relative">
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-white font-black text-xs uppercase tracking-[0.4em] mb-2"
        >
          {text}
        </motion.p>
        <div className="flex justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              className="w-1 h-1 bg-[#BA995D] rounded-full"
            />
          ))}
        </div>
      </div>

      {/* Stylized Progress Bar (Indeterminate) */}
      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white/5 overflow-hidden">
        <motion.div
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="w-1/3 h-full bg-gradient-to-r from-transparent via-[#BA995D] to-transparent"
        />
      </div>
    </div>
  );
}
