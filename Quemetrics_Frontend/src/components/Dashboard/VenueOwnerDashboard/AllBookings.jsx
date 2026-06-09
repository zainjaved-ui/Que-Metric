import { useContext, useEffect, useState } from 'react';
import { VenueOwnerContext } from '../../../contexts/VenueOwnerContext';
import Card from '../../ui/Card';
import Loader from '../../ui/Loader';
import { FaCalendar, FaTable, FaUser, FaClock, FaFilter } from 'react-icons/fa';

export default function AllBookings() {
  const { loading, getAllBookings } = useContext(VenueOwnerContext);
  const [bookings, setBookings] = useState([]);
  const [venues, setVenues] = useState([]);
  const [filteredBookings, setFilteredBookings] = useState([]);
  const [filters, setFilters] = useState({
    status: 'All',
    date: '',
    search: '',
    venueId: 'All',
    tableId: 'All'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    loadBookings();
  }, []);

  useEffect(() => {
    applyFilters();
    setCurrentPage(1); // Reset to first page on filter change
  }, [bookings, filters]);

  const loadBookings = async () => {
    const result = await getAllBookings();
    if (result.success) {
      // result.data is now { bookings, venues }
      setBookings(result.data.bookings || []);
      setVenues(result.data.venues || []);
    }
  };

  const applyFilters = () => {
    let filtered = [...bookings];

    if (filters.status !== 'All') {
      filtered = filtered.filter(b => b.status === filters.status.toLowerCase());
    }

    if (filters.date) {
      filtered = filtered.filter(b => b.bookingDate === filters.date);
    }

    if (filters.venueId !== 'All') {
      filtered = filtered.filter(b => b.venueId === filters.venueId);
      
      if (filters.tableId !== 'All') {
        // Compare table identifier or name
        // Note: bookings might have tableName but we need to match it with venue table identifier
        const selectedVenue = venues.find(v => v.id === filters.venueId);
        const selectedTable = selectedVenue?.tables.find(t => String(t.id) === String(filters.tableId));
        
        if (selectedTable) {
           filtered = filtered.filter(b => 
             String(b.tableNumber) === String(selectedTable.id) || 
             b.tableName?.toLowerCase() === selectedTable.name?.toLowerCase()
           );
        }
      }
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(b => 
        (b.player?.name || '').toLowerCase().includes(search) ||
        (b.opponent?.name || '').toLowerCase().includes(search) ||
        (b.memberBookingName || '').toLowerCase().includes(search) ||
        (b.tableName || '').toLowerCase().includes(search)
      );
    }

    setFilteredBookings(filtered);
  };

  // Pagination Logic
  const totalPages = Math.ceil(filteredBookings.length / itemsPerPage);
  const paginatedBookings = filteredBookings.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* ── Hero Header ──────────────────────────────────────────────── */}
      <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
        
        <div className="max-w-5xl w-full mx-auto relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-10">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center justify-center xl:justify-start gap-3 text-center xl:text-left">
              <span className="w-6 h-[1px] bg-[#BA995D]" /> Logistics Roster
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2 text-center xl:text-left">All Bookings</h1>
            <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] max-w-md leading-relaxed text-center xl:text-left mx-auto xl:mx-0">
               Manage all reservations across your venue.
            </p>
          </div>

          {/* Stat Strip - Premium Design */}
          <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl min-w-[240px]">
            <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <span className="text-lg font-black tracking-tighter text-white">{filteredBookings.length}</span>
              <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Total Records</span>
            </div>
            <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <button 
                onClick={loadBookings}
                className="text-[10px] text-[#BA995D] hover:text-white transition-colors"
              >
                <span className="text-lg font-black tracking-tighter block leading-none">SYNC</span>
                <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Refresh Feed</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 md:py-16 flex flex-col gap-8 relative z-20 -mt-8">
        {loading && <Loader text="Refreshing Feed..." />}

        {/* Filters Bar */}
        <div className="p-3 mb-5 border border-gray-50 shadow-xl shadow-[#132F45]/5 bg-white rounded-[1.5rem] md:rounded-[2rem]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div className="group">
              <label className="block text-[7.5px] font-black text-gray-400 uppercase tracking-widest mb-1.5 group-focus-within:text-[#BA995D] transition-colors pl-1">Search Activity</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Name or table..."
                  className="w-full pl-10 pr-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px]"
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                />
                <FaFilter className="absolute left-4 top-1/2 -translate-y-1/2 text-[#BA995D] text-[9px] opacity-50" />
              </div>
            </div>
            <div className="group">
              <label className="block text-[7.5px] font-black text-gray-400 uppercase tracking-widest mb-1.5 group-focus-within:text-[#BA995D] transition-colors pl-1">1. Venue</label>
              <select
                className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px] appearance-none"
                value={filters.venueId}
                onChange={(e) => setFilters({...filters, venueId: e.target.value, tableId: 'All'})}
              >
                <option value="All">All Venues</option>
                {venues.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div className="group">
              <label className="block text-[7.5px] font-black text-gray-400 uppercase tracking-widest mb-1.5 group-focus-within:text-[#BA995D] transition-colors pl-1">2. Table</label>
              <select
                className={`w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px] appearance-none ${filters.venueId === 'All' ? 'opacity-50 cursor-not-allowed' : ''}`}
                value={filters.tableId}
                onChange={(e) => setFilters({...filters, tableId: e.target.value})}
                disabled={filters.venueId === 'All'}
              >
                <option value="All">All Tables</option>
                {venues.find(v => v.id === filters.venueId)?.tables.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="group">
              <label className="block text-[7.5px] font-black text-gray-400 uppercase tracking-widest mb-1.5 group-focus-within:text-[#BA995D] transition-colors pl-1">Date</label>
              <input
                type="date"
                className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px]"
                value={filters.date}
                onChange={(e) => setFilters({...filters, date: e.target.value})}
              />
            </div>
            <div className="group">
              <label className="block text-[7.5px] font-black text-gray-400 uppercase tracking-widest mb-1.5 group-focus-within:text-[#BA995D] transition-colors pl-1">Status</label>
              <select
                className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px] appearance-none"
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
              >
                <option>All</option>
                <option>Pending</option>
                <option>Confirmed</option>
                <option>Completed</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setFilters({ status: 'All', date: '', search: '', venueId: 'All', tableId: 'All' })}
                className="flex-1 px-4 py-2.5 border border-gray-100 text-[#132F45] bg-[#FAFAFA] rounded-2xl hover:bg-gray-100 transition-all font-black text-[8px] uppercase tracking-widest active:scale-95 shadow-sm"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Bookings Table */}
        <div className="border border-gray-50 shadow-xl shadow-[#132F45]/5 bg-white rounded-[1.5rem] md:rounded-[2rem] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="bg-[#132F45]">
                  <th className="px-4 py-3 text-[7.5px] font-black text-[#FDF2D1] uppercase tracking-[0.2em] border-b border-[#1A3F5C]">Date</th>
                  <th className="px-4 py-3 text-[7.5px] font-black text-[#FDF2D1] uppercase tracking-[0.2em] border-b border-[#1A3F5C]">Time Slot</th>
                  <th className="px-4 py-3 text-[7.5px] font-black text-[#FDF2D1] uppercase tracking-[0.2em] border-b border-[#1A3F5C]">Surface</th>
                  <th className="px-5 py-3 text-[7.5px] font-black text-[#FDF2D1] uppercase tracking-[0.2em] border-b border-[#1A3F5C]">Participant Identity</th>
                  <th className="px-4 py-3 text-center text-[7.5px] font-black text-[#FDF2D1] uppercase tracking-[0.2em] border-b border-[#1A3F5C]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {paginatedBookings.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12">
                      <div className="flex flex-col items-center justify-center text-center opacity-40">
                        <FaCalendar className="text-2xl text-[#BA995D] mb-3" />
                        <p className="text-[#132F45] font-black text-[10px] uppercase tracking-widest">No Activity Records</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedBookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <FaCalendar className="text-[#BA995D] text-[9px]" />
                          <span className="text-[10px] font-black text-[#132F45] tabular-nums tracking-tight">{booking.bookingDate}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <FaClock className="text-[#BA995D] text-[9px]" />
                          <span className="text-[10px] font-bold text-gray-500 tracking-tighter tabular-nums">
                            {booking.startTime} - {booking.endTime}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <FaTable className="text-[#BA995D] text-[9px]" />
                            <span className="text-[10px] font-black text-[#132F45] uppercase tracking-tight">{booking.tableName}</span>
                          </div>
                          {booking.venueId && (
                            <div className="text-[6px] font-black uppercase tracking-widest text-gray-400 pl-4 italic">
                               {venues.find(v => v.id === booking.venueId)?.name || 'Linked Venue'}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-[#FDF2D1] rounded flex items-center justify-center text-[#BA995D] font-black text-[9px] shadow-inner uppercase shrink-0">
                            {(booking.memberBookingName || (booking.player?.name || 'M'))[0]}
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-[#132F45] uppercase tracking-tight leading-none mb-0.5 group-hover:text-[#BA995D]">
                              {booking.memberBookingName || (booking.player ? `${booking.player.name} vs ${booking.opponent?.name || 'TBD'}` : 'Direct Entry')}
                            </div>
                            {booking.league && (
                              <div className="text-[7.5px] text-[#BA995D] font-black uppercase tracking-widest">{booking.league.name}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-center">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm ring-1 ring-inset ${
                          booking.status === 'confirmed' ? 'bg-[#EBF5EE] text-[#2D6A4F] ring-[#B7E4C7]' :
                          booking.status === 'pending' ? 'bg-[#FFF9E1] text-[#713F12] ring-[#FEF08A]' :
                          'bg-gray-100 text-gray-500 ring-gray-200'
                        }`}>
                          {booking.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4 px-2">
            <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center md:text-left">
              Showing <span className="text-[#132F45]">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-[#132F45]">{Math.min(currentPage * itemsPerPage, filteredBookings.length)}</span> of <span className="text-[#BA995D]">{filteredBookings.length}</span> Entries
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all border outline-none active:scale-95 ${
                  currentPage === 1
                    ? 'bg-gray-50 text-gray-300 border-gray-50 cursor-not-allowed'
                    : 'bg-white text-[#132F45] border-gray-100 hover:border-[#BA995D] hover:shadow-sm'
                }`}
              >
                Prev
              </button>
              
              <div className="flex items-center gap-1">
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => handlePageChange(i + 1)}
                    className={`w-7 h-7 rounded-lg text-[8px] font-black flex items-center justify-center transition-all ${
                      currentPage === i + 1
                        ? 'bg-[#132F45] text-white shadow-lg shadow-[#132F45]/10'
                        : 'bg-white text-gray-400 border border-gray-50 hover:border-[#BA995D] hover:text-[#BA995D]'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all border outline-none active:scale-95 ${
                  currentPage === totalPages
                    ? 'bg-gray-50 text-gray-300 border-gray-50 cursor-not-allowed'
                    : 'bg-white text-[#132F45] border-gray-100 hover:border-[#BA995D] hover:shadow-sm'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
