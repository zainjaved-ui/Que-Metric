import { useContext, useEffect, useState } from 'react';
import { VenueOwnerContext } from '../../../contexts/VenueOwnerContext';
import Loader from '../../ui/Loader';
import { FaTrash, FaPhone, FaClock, FaCalendar, FaTable, FaFilter, FaMapMarkerAlt, FaChevronDown } from 'react-icons/fa';
import { toast } from 'react-hot-toast';

export default function MyBookings() {
  const { loading, getMemberBookings, deleteBooking } = useContext(VenueOwnerContext);
  const [bookings, setBookings] = useState([]);
  const [venues, setVenues] = useState([]);
  const [filters, setFilters] = useState({
    status: 'All',
    date: '',
    venueId: 'All',
    tableId: 'All'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    loadBookings();
  }, []);

  const loadBookings = async () => {
    const result = await getMemberBookings();
    if (result.success) {
      // result.data is now { bookings, venues }
      setBookings(Array.isArray(result.data.bookings) ? result.data.bookings : []);
      setVenues(result.data.venues || []);
    }
  };

  const handleDelete = async (bookingId) => {
    if (window.confirm('Are you sure you want to delete this member booking?')) {
      const result = await deleteBooking(bookingId);
      if (result.success) {
        toast.success(result.message);
        loadBookings();
      } else {
        toast.error(result.error);
      }
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const filteredBookings = bookings.filter(b => {
    if (filters.status !== 'All' && b.status !== filters.status.toLowerCase()) return false;
    if (filters.date && b.bookingDate !== filters.date) return false;
    if (filters.venueId !== 'All' && b.venueId !== filters.venueId) return false;
    if (filters.venueId !== 'All' && filters.tableId !== 'All') {
      const selectedVenue = venues.find(v => v.id === filters.venueId);
      const selectedTable = selectedVenue?.tables.find(t => String(t.id) === String(filters.tableId));
      if (selectedTable) {
        const nameMatch = b.tableName?.toLowerCase() === selectedTable.name?.toLowerCase();
        const numberMatch = String(b.tableNumber) === String(selectedTable.id);
        if (!nameMatch && !numberMatch) return false;
      }
    }
    return true;
  });

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

  const currentVenueTables = venues.find(v => v.id === filters.venueId)?.tables || [];

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* ── Hero Header ──────────────────────────────────────────────── */}
      <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
        
        <div className="max-w-5xl w-full mx-auto relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-10">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center justify-center xl:justify-start gap-3 text-center xl:text-left">
              <span className="w-6 h-[1px] bg-[#BA995D]" /> Direct Reservations
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2 text-center xl:text-left">My Bookings</h1>
            <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] max-w-md leading-relaxed text-center xl:text-left mx-auto xl:mx-0">
               View and manage your recent bookings.
            </p>
          </div>

          {/* Stat Strip - Premium Design */}
          <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl min-w-[240px]">
             <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <span className="text-lg font-black tracking-tighter text-white">{filteredBookings.length}</span>
              <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Member Load</span>
            </div>
            <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <button 
                onClick={loadBookings}
                className="text-[10px] text-[#BA995D] hover:text-white transition-colors"
              >
                <span className="text-lg font-black tracking-tighter block leading-none">SYNC</span>
                <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Update List</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 md:py-16 flex flex-col gap-8 relative z-20 -mt-8">
        {loading && <Loader text="Updating Bookings..." />}

        {/* Filters Bar */}
        <div className="p-4 border border-gray-50 shadow-xl shadow-[#132F45]/5 bg-white rounded-[1.5rem] md:rounded-[2rem]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            {/* 1. Venue */}
            <div className="flex flex-col gap-2">
              <label className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest pl-1">1. Venue</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BA995D]">
                  <FaMapMarkerAlt className="text-[9px]" />
                </div>
                <select
                  className="w-full pl-8 pr-8 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px] appearance-none"
                  value={filters.venueId}
                  onChange={(e) => setFilters({ ...filters, venueId: e.target.value, tableId: 'All' })}
                >
                  <option value="All">All Venues</option>
                  {venues.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                <FaChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#BA995D] pointer-events-none text-[7px]" />
              </div>
            </div>

            {/* 2. Table */}
            <div className="flex flex-col gap-2">
              <label className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest pl-1">2. Table</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BA995D]">
                  <FaTable className="text-[9px]" />
                </div>
                <select
                  className={`w-full pl-8 pr-8 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px] appearance-none ${filters.venueId === 'All' ? 'opacity-40 cursor-not-allowed' : ''}`}
                  value={filters.tableId}
                  onChange={(e) => setFilters({ ...filters, tableId: e.target.value })}
                  disabled={filters.venueId === 'All'}
                >
                  <option value="All">All Tables</option>
                  {currentVenueTables.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <FaChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#BA995D] pointer-events-none text-[7px]" />
              </div>
            </div>

            {/* Date */}
            <div className="flex flex-col gap-2">
              <label className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest pl-1">Date</label>
              <input
                type="date"
                className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px]"
                value={filters.date}
                onChange={(e) => setFilters({ ...filters, date: e.target.value })}
              />
            </div>

            {/* Status */}
            <div className="flex flex-col gap-2">
              <label className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest pl-1">Status</label>
              <select
                className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px] appearance-none"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option>All</option>
                <option>Pending</option>
                <option>Confirmed</option>
              </select>
            </div>

            {/* Reset */}
            <div className="flex items-end">
              <button 
                onClick={() => setFilters({ status: 'All', date: '', venueId: 'All', tableId: 'All' })}
                className="w-full px-4 py-2.5 border border-gray-100 text-[#132F45] bg-[#FAFAFA] rounded-2xl hover:bg-gray-100 transition-all font-black text-[8px] uppercase tracking-widest active:scale-95 shadow-sm"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="border border-gray-50 shadow-xl shadow-[#132F45]/5 bg-white rounded-[1.5rem] md:rounded-[2rem] overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-[#FAFAFA]/50">
            <h2 className="text-[8px] font-black text-[#132F45] uppercase tracking-[0.25em] flex items-center gap-2">
              <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> Direct Entries
            </h2>
            <span className="bg-[#FDF2D1] text-[#BA995D] px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest shadow-sm ring-1 ring-[#BA995D]/10">
              {filteredBookings.length} Total
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="bg-[#132F45]">
                  <th className="px-4 py-3 text-[7.5px] font-black text-[#FDF2D1] uppercase tracking-[0.2em] border-b border-[#1A3F5C]">Date</th>
                  <th className="px-4 py-3 text-[7.5px] font-black text-[#FDF2D1] uppercase tracking-[0.2em] border-b border-[#1A3F5C]">Slot</th>
                  <th className="px-4 py-3 text-[7.5px] font-black text-[#FDF2D1] uppercase tracking-[0.2em] border-b border-[#1A3F5C]">Resource</th>
                  <th className="px-5 py-3 text-[7.5px] font-black text-[#FDF2D1] uppercase tracking-[0.2em] border-b border-[#1A3F5C]">Member Contact</th>
                  <th className="px-4 py-3 text-center text-[7.5px] font-black text-[#FDF2D1] uppercase tracking-[0.2em] border-b border-[#1A3F5C]">Status</th>
                  <th className="px-4 py-3 text-right text-[7.5px] font-black text-[#FDF2D1] uppercase tracking-[0.2em] border-b border-[#1A3F5C]">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {paginatedBookings.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12">
                      <div className="flex flex-col items-center justify-center text-center opacity-40">
                        <FaCalendar className="text-2xl text-[#BA995D] mb-3" />
                        <p className="text-[#132F45] font-black text-[10px] uppercase tracking-widest">No Direct Bookings</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedBookings.map((booking) => {
                    const memberLabel =
                      (booking.memberBookingName && String(booking.memberBookingName).trim()) ||
                      (booking.memberBookingPhone && String(booking.memberBookingPhone).trim()) ||
                      'Member';
                    const memberInitial = memberLabel.charAt(0).toUpperCase() || '?';
                    const bookingVenue = venues.find(v => v.id === booking.venueId);

                    return (
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
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <FaTable className="text-[#BA995D] text-[9px]" />
                            <span className="text-[10px] font-black text-[#132F45] uppercase tracking-tight">{booking.tableName ?? '—'}</span>
                          </div>
                          {bookingVenue && (
                            <div className="text-[6px] font-black uppercase tracking-widest text-gray-400 pl-4 italic">
                              {bookingVenue.name}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-[#FDF2D1] rounded flex items-center justify-center text-[#BA995D] font-black text-[9px] shadow-inner uppercase shrink-0">
                            {memberInitial}
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-[#132F45] uppercase tracking-tight leading-none mb-0.5 group-hover:text-[#BA995D]">
                              {memberLabel}
                            </div>
                            {booking.memberBookingPhone && (
                              <div className="flex items-center gap-1 text-[7.5px] text-gray-400 font-bold uppercase tracking-widest">
                                <FaPhone className="text-[6px]" /> {booking.memberBookingPhone}
                              </div>
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
                      <td className="px-4 py-2.5 whitespace-nowrap text-right text-[10px]">
                        <button
                          onClick={() => handleDelete(booking.id)}
                          className="text-red-400 hover:text-red-600 transition-colors p-1"
                          title="Delete Booking"
                        >
                          <FaTrash className="text-[10px]" />
                        </button>
                      </td>
                    </tr>
                    );
                  })
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
