import { useContext, useEffect, useState } from 'react';
import { VenueOwnerContext } from '../../../contexts/VenueOwnerContext';
import Loader from '../../ui/Loader';
import { FaMapMarkerAlt, FaChevronDown } from 'react-icons/fa';

export default function MyTables() {
  const { dashboardStats, loading, getDashboardStats } = useContext(VenueOwnerContext);
  const [selectedVenueId, setSelectedVenueId] = useState(null);

  useEffect(() => {
    getDashboardStats();
  }, []);

  useEffect(() => {
    if (dashboardStats?.venues?.length > 0 && !selectedVenueId) {
      setSelectedVenueId(dashboardStats.venues[0].id);
    }
  }, [dashboardStats]);

  const stats = dashboardStats || {
    venueName: 'Venue',
    tables: [],
    venues: []
  };

  const currentVenue = stats.venues?.find(v => v.id === selectedVenueId) || (stats.venues?.length > 0 ? stats.venues[0] : null);
  const displayTables = currentVenue ? currentVenue.tables : stats.tables;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* ── Hero Header ──────────────────────────────────────────────── */}
      <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
        
        <div className="max-w-5xl w-full mx-auto relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-10">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center justify-center xl:justify-start gap-3 text-center xl:text-left">
              <span className="w-6 h-[1px] bg-[#BA995D]" /> Equipment
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2 text-center xl:text-left">My Tables</h1>
            <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] max-w-md leading-relaxed text-center xl:text-left mx-auto xl:mx-0">
               Manage your facility's tables and operational status.
            </p>
          </div>

          {/* Stat Strip - Premium Design */}
          <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl min-w-[240px]">
             <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <span className="text-lg font-black tracking-tighter text-white">{displayTables.length}</span>
              <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Total Units</span>
            </div>
            <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <div className="flex flex-col items-center translate-y-0.5">
                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse mb-1"></span>
                <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-[#BA995D] whitespace-nowrap">Operational</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 md:py-16 flex flex-col gap-8 relative z-20 -mt-8">
        {/* Filter Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em]">Venue Filter</h2>
            <p className="text-[8px] text-gray-400 font-medium uppercase tracking-wider">Select a venue to view its equipment</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative group min-w-[200px]">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#BA995D]">
                <FaMapMarkerAlt className="text-[10px]" />
              </div>
              <select 
                value={selectedVenueId}
                onChange={(e) => setSelectedVenueId(e.target.value)}
                className="w-full appearance-none bg-[#FAFAFA] border border-gray-100 text-[#132F45] text-[10px] font-black uppercase tracking-widest pl-10 pr-10 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#BA995D] transition-all cursor-pointer hover:bg-gray-50"
              >
                {stats.venues?.length > 0 ? (
                  stats.venues.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))
                ) : (
                  <option value="">{stats.venueName || 'No Venue Found'}</option>
                )}
              </select>
              <FaChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-[#BA995D] pointer-events-none text-[8px]" />
            </div>
          </div>
        </div>

        {loading && <Loader text="Fetching Tables..." />}
        
        {displayTables.length === 0 && !loading && (
          <div className="text-center py-20 bg-white rounded-[2rem] border border-gray-100 shadow-sm">
             <p className="text-[10px] font-black text-[#132F45]/30 uppercase tracking-[0.2em]">No tables found for this venue.</p>
          </div>
        )}

        {/* Tables Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayTables.map((table) => (
            <div key={table.id} className="p-4 bg-white border border-gray-50 rounded-[1.5rem] md:rounded-[2rem] flex items-center gap-4 hover:shadow-2xl shadow-xl shadow-[#132F45]/5 group transition-all cursor-pointer relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-[#FDF2D1]/10 rounded-bl-full -mr-4 -mt-4 group-hover:bg-[#FDF2D1]/20 transition-all pointer-events-none"></div>
              <div className="w-10 h-10 bg-[#FAFAFA] border border-gray-100 rounded-xl flex items-center justify-center shadow-inner shrink-0 group-hover:bg-[#FDF2D1] transition-colors relative z-10 text-[10px]">
                <svg className="w-4 h-4 text-[#BA995D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0 z-10 relative">
                <p className="font-black text-[#132F45] text-xs uppercase tracking-tight truncate group-hover:text-[#BA995D] transition-colors">{table.name}</p>
                <div className="inline-flex items-center gap-1.5 text-[6.5px] font-black text-[#166534] uppercase tracking-widest mt-1 px-2 py-0.5 bg-green-50 rounded-lg ring-1 ring-[#166534]/10">
                  <span className="w-1 h-1 rounded-full bg-[#166534] animate-pulse"></span>
                  Ready
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}