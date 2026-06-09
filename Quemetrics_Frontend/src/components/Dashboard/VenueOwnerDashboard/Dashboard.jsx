import { useContext, useEffect } from 'react';
import { VenueOwnerContext } from '../../../contexts/VenueOwnerContext';
import Loader from '../../ui/Loader';

export default function VenueOwnerDashboard() {
  const { ownedVenues, dashboardStats, loading, getDashboardStats, getMyVenues } = useContext(VenueOwnerContext);

  useEffect(() => {
    getDashboardStats();
    getMyVenues();
  }, [getDashboardStats, getMyVenues]);

  const stats = dashboardStats || {
    todaysBookings: 0,
    memberBookings: 0,
    upcomingBookings: 0,
    venueName: 'Venue',
    tables: []
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* ── Hero Header ──────────────────────────────────────────────── */}
      <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-0 right-0 w-160 h-160 bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />

        <div className="max-w-5xl w-full mx-auto relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-10">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center justify-center xl:justify-start gap-3 text-center xl:text-left">
              <span className="w-6 h-px bg-[#BA995D]" /> Dashboard
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2 text-center xl:text-left">Dashboard</h1>
            <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] max-w-md leading-relaxed text-center xl:text-left mx-auto xl:mx-0">
               Overview of your venue operations.
            </p>
          </div>

          {/* Stat Strip - Premium Design */}
          <div className="grid grid-cols-3 gap-1 bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl min-w-75">
            <div className="flex flex-col items-center text-center px-4 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <span className="text-lg font-black tracking-tighter text-white">{stats.todaysBookings}</span>
              <span className="text-[6.5px] font-black uppercase tracking-widest text-white/30 mt-0.5 whitespace-nowrap">Today's Load</span>
            </div>
            <div className="flex flex-col items-center text-center px-4 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <span className="text-lg font-black tracking-tighter text-[#BA995D] drop-shadow-[0_0_10px_rgba(186,153,93,0.3)]">{stats.memberBookings}</span>
              <span className="text-[6.5px] font-black uppercase tracking-widest text-white/30 mt-0.5 whitespace-nowrap">Member Base</span>
            </div>
            <div className="flex flex-col items-center text-center px-4 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <span className="text-lg font-black tracking-tighter text-white">{stats.upcomingBookings}</span>
              <span className="text-[6.5px] font-black uppercase tracking-widest text-white/30 mt-0.5 whitespace-nowrap">Pending Fixtures</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 md:py-16 flex flex-col gap-10 relative z-20 -mt-8">
        {loading && <Loader text="Refreshing Stats..." />}

        {/* Quick actions - High Density Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: "Today's Load", value: stats.todaysBookings, grad: 'from-amber-400 to-[#BA995D]', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { label: 'Member Base', value: stats.memberBookings, grad: 'from-blue-600 to-indigo-800', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
            { label: 'Pending Units', value: stats.upcomingBookings, grad: 'from-red-500 to-red-700', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
          ].map(a => (
            <div key={a.label} className="group">
              <div className={`aspect-video bg-linear-to-br ${a.grad} rounded-2xl p-6 text-white flex flex-col justify-between border border-white/10 shadow-xl group-hover:scale-[1.02] group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] transition-all duration-500`}>
                <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center shadow-inner group-hover:rotate-6 transition-transform">
                   <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={a.icon} />
                   </svg>
                </div>
                <div className="space-y-0.5">
                   <p className="text-[8px] font-black uppercase tracking-[0.2em] opacity-60">Analytics</p>
                   <div className="flex items-end justify-between">
                     <p className="text-base font-black uppercase tracking-tight leading-none">{a.label}</p>
                     <p className="text-2xl font-black leading-none tracking-tighter">{a.value}</p>
                   </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Owned Venues Summary */}
        {ownedVenues.length > 0 && (
          <div className="rounded-3xl border border-[#E9E4D8] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#BA995D]">Venue Owner</p>
                <h2 className="text-xl font-black uppercase tracking-tight text-[#132F45]">Owned Venues</h2>
              </div>
              <div className="rounded-2xl bg-[#132F45] px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white">
                {ownedVenues.length} total
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ownedVenues.map((venue) => (
                <div key={venue.id} className="rounded-2xl border border-gray-100 bg-[#FCFBF7] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-tight text-[#132F45]">{venue.name}</h3>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                        {venue.source} venue
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#132F45] border border-gray-100">
                      {venue.tables?.length || 0} tables
                    </span>
                  </div>
                  <p className="mt-4 text-xs text-gray-500">
                    {venue.clubName ? `Club: ${venue.clubName}` : 'Direct venue ownership'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Your Tables Section - Grouped by Venue */}
        <div className="flex flex-col gap-10">
          {(stats.venues && stats.venues.length > 0) ? (
            stats.venues.map((venue) => (
              <div key={venue.id} className="flex flex-col gap-6">
                <div className="flex items-center justify-between px-1.5">
                  <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.25em] flex items-center gap-3">
                    <div className="w-1 h-3 bg-[#BA995D] rounded-full" /> {venue.name}
                    <span className="text-[8px] text-gray-300 font-medium lowercase tracking-normal bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                      {venue.tables?.length || 0} units
                    </span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {venue.tables.map((table) => (
                    <div key={table.id} className="flex items-center gap-3.5 p-3.5 rounded-2xl border border-gray-50 bg-white hover:border-[#FDF2D1] hover:shadow-xl hover:shadow-[#132F45]/5 transition-all duration-500 group relative overflow-hidden cursor-pointer">
                      <div className="w-10 h-10 rounded-xl bg-linear-to-br from-[#132F45] to-[#1A3F5C] flex items-center justify-center text-white shrink-0 shadow-lg shadow-[#132F45]/10 group-hover:scale-105 transition-transform duration-500">
                        <svg className="w-4.5 h-4.5 text-[#BA995D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0 relative z-10">
                        <p className="text-[13px] font-black text-[#132F45] uppercase tracking-tight truncate group-hover:text-[#BA995D] transition-colors">{table.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-1 h-1 rounded-full bg-emerald-500" />
                          <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Active State</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between px-1.5">
                <h2 className="text-[8px] font-black text-[#132F45] uppercase tracking-[0.25em] flex items-center gap-2">
                  <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> {stats.venueName || 'Managed Resources'}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.tables.map((table) => (
                  <div key={table.id} className="flex items-center gap-3.5 p-3.5 rounded-2xl border border-gray-50 bg-white hover:border-[#FDF2D1] hover:shadow-xl hover:shadow-[#132F45]/5 transition-all duration-500 group relative overflow-hidden cursor-pointer">
                    <div className="w-10 h-10 rounded-xl bg-linear-to-br from-[#132F45] to-[#1A3F5C] flex items-center justify-center text-white shrink-0 shadow-lg shadow-[#132F45]/10 group-hover:scale-105 transition-transform duration-500">
                      <svg className="w-4.5 h-4.5 text-[#BA995D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0 relative z-10">
                      <p className="text-[13px] font-black text-[#132F45] uppercase tracking-tight truncate group-hover:text-[#BA995D] transition-colors">{table.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-1 h-1 rounded-full bg-emerald-500" />
                        <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Active State</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}