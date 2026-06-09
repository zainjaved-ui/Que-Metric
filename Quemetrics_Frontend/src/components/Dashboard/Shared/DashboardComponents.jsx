import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowRight } from 'react-icons/fa';
import { motion } from 'framer-motion';

/**
 * Section Header with gold vertical bar
 */
export const SectionHeader = ({ title, subtitle, linkTo, linkLabel }) => (
  <div className="flex items-center justify-between mb-4 px-1.5">
    <div>
      <h2 className="text-[9px] font-black text-[#132F45] uppercase tracking-[0.25em] flex items-center gap-2">
        <span className="w-0.5 h-2.5 bg-[#BA995D] rounded-full inline-block" /> {title}
      </h2>
      {subtitle && <p className="text-[7px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{subtitle}</p>}
    </div>
    {linkTo && (
      <Link to={linkTo} className="group flex items-center gap-1.5 text-[8px] font-black text-[#BA995D] hover:text-[#132F45] transition-colors uppercase tracking-[0.15em]">
        {linkLabel} <FaArrowRight className="text-[6px] group-hover:translate-x-0.5 transition-transform" />
      </Link>
    )}
  </div>
);

/**
 * Ultra-Compact Stat Card
 */
export const CompactStatCard = ({ label, value, icon, color, gradient }) => (
  <div className={`bg-gradient-to-br ${gradient || 'from-[#132F45] to-[#1a3f5c]'} rounded-2xl p-4 text-white shadow-lg relative overflow-hidden group border border-white/5`}>
    <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white/5 rounded-full blur-xl group-hover:scale-110 transition-transform"></div>
    <div className="flex items-center gap-2 text-[#BA995D] mb-1.5 grayscale group-hover:grayscale-0 transition-all opacity-80">
      {icon && React.isValidElement(icon) ? React.cloneElement(icon, { size: 10 }) : icon}
      <span className="text-[7px] font-black uppercase tracking-widest leading-none">{label}</span>
    </div>
    <div className="text-2xl font-black tracking-tighter leading-none">{value}</div>
  </div>
);

/**
 * Action Tile for quick navigation
 */
export const ActionTile = ({ icon, title, label, color, path }) => (
  <Link to={path} className="group">
    <div className={`${color} rounded-2xl p-4 text-white flex flex-col justify-between border border-white/10 shadow-lg group-hover:scale-[1.02] transition-all duration-500 min-h-[90px]`}>
      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center group-hover:rotate-6 transition-transform">
        {icon && React.isValidElement(icon) ? React.cloneElement(icon, { size: 14 }) : icon}
      </div>
      <div>
        <p className="text-[7px] font-black uppercase tracking-[0.2em] opacity-50 mb-0.5">{label}</p>
        <p className="text-[11px] font-black uppercase tracking-tight leading-none">{title}</p>
      </div>
    </div>
  </Link>
);

/**
 * Status Badge for consistent labeling
 */
export const CompactStatusBadge = ({ status, config }) => {
  const cfg = config[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8.5px] font-black uppercase ${cfg.bg} ${cfg.text} border border-black/5 shadow-sm`}>
      <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};
