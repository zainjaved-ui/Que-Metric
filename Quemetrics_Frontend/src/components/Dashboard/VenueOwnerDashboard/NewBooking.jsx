import { useContext, useEffect, useState } from 'react';
import { VenueOwnerContext } from '../../../contexts/VenueOwnerContext';
import Loader from '../../ui/Loader';
import { FaArrowLeft, FaClock, FaMapMarkerAlt, FaTable, FaChevronDown } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function NewBooking() {
  const { loading, getSlotAvailability, createMemberBooking } = useContext(VenueOwnerContext);
  const [slotData, setSlotData] = useState({ tables: [], timeSlots: [], venues: [] });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null); // { time, tableNumber, tableName, startTime, endTime }
  
  const [formData, setFormData] = useState({
    memberName: '',
    phone: '',
    price: '',
    notes: ''
  });
  
  const navigate = useNavigate();

  useEffect(() => {
    fetchSlots(selectedDate);
  }, [selectedDate]);

  const fetchSlots = async (dateStr) => {
    const dateObj = new Date(dateStr);
    const result = await getSlotAvailability(dateObj);
    if (result.success) {
      setSlotData({
        tables: result.data.tables || [],
        timeSlots: result.data.timeSlots || [],
        venues: result.data.venues || []
      });
      
      // Auto-select first venue and its first table
      if (result.data.venues?.length > 0 && !selectedVenueId) {
        setSelectedVenueId(String(result.data.venues[0].id));
        if (result.data.venues[0].tables?.length > 0) {
          setSelectedTableId(String(result.data.venues[0].tables[0].id));
        }
      }
    }
  };

  // When venue changes, reset table selection
  useEffect(() => {
    if (selectedVenueId && slotData.venues.length > 0) {
      const venue = slotData.venues.find(v => String(v.id) === String(selectedVenueId));
      if (venue?.tables?.length > 0) {
        const tableInVenue = venue.tables.find(t => String(t.id) === String(selectedTableId));
        if (!tableInVenue) {
          setSelectedTableId(String(venue.tables[0].id));
          setSelectedSlot(null);
        }
      }
    }
  }, [selectedVenueId]);

  // Positional offset approach - reliable across multiple venues
  const venueIndex = slotData.venues.findIndex(v => String(v.id) === String(selectedVenueId));
  const currentVenue = venueIndex >= 0 ? slotData.venues[venueIndex] : null;
  const venueTables = currentVenue?.tables || [];
  const tableIndexInVenue = venueTables.findIndex(t => String(t.id) === String(selectedTableId));
  const currentTable = tableIndexInVenue >= 0 ? venueTables[tableIndexInVenue] : null;

  // Sum up all tables from preceding venues to get the correct flat index
  const venueOffset = venueIndex >= 0
    ? slotData.venues.slice(0, venueIndex).reduce((sum, v) => sum + (v.tables?.length || 0), 0)
    : 0;
  const activeTableIndex = tableIndexInVenue >= 0 ? venueOffset + tableIndexInVenue : -1;

  // Only show slots relevant to the selected table
  const relevantTimeSlots = slotData.timeSlots.filter(ts => {
    if (activeTableIndex === -1) return false;
    const s = ts.tableStatus[activeTableIndex];
    return s && s.status !== 'unavailable';
  });

  const handleSlotSelect = (timeSlot) => {
    if (!currentTable || activeTableIndex === -1) {
      toast.error('Please select a venue and table first');
      return;
    }
    const status = timeSlot.tableStatus[activeTableIndex];
    if (status?.status === 'booked' || status?.status === 'unavailable') {
      toast.error('This slot is already booked or unavailable');
      return;
    }
    setSelectedSlot({
      time: timeSlot.time,
      startTime: timeSlot.startTime,
      endTime: timeSlot.endTime,
      tableNumber: activeTable.tableNumber,
      tableName: activeTable.name
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSlot) return toast.error('Please select a table slot');
    if (!formData.memberName) return toast.error('Please enter member name');

    // Validate name
    if (!/^[A-Za-z\s]+$/.test(formData.memberName)) {
      return toast.error('Member name must only contain alphabets and spaces');
    }
    if (formData.memberName.length > 50) {
      return toast.error('Member name must not exceed 50 characters');
    }

    // Validate phone if provided
    if (formData.phone && !/^\d{11}$/.test(formData.phone)) {
      return toast.error('Phone number must be exactly 11 digits');
    }

    const submissionData = {
      ...formData,
      date: selectedDate,
      startTime: selectedSlot.startTime.length === 5 ? `${selectedSlot.startTime}:00` : selectedSlot.startTime,
      endTime: selectedSlot.endTime.length === 5 ? `${selectedSlot.endTime}:00` : selectedSlot.endTime,
      tableNumber: selectedSlot.tableNumber,
      tableName: selectedSlot.tableName
    };

    const result = await createMemberBooking(submissionData);
    if (result.success) {
      toast.success(result.message);
      navigate('/venue-owner/my-bookings');
    } else {
      toast.error(result.error || 'Failed to create booking');
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {loading && <Loader text="Configuring Booking..." />}
      {/* ── Hero Header ──────────────────────────────────────────────── */}
      <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
        
        <div className="max-w-6xl w-full mx-auto relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-10">
          <div>
            <button 
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-[#BA995D] hover:text-white transition-colors w-fit text-[9px] font-black uppercase tracking-widest mb-6"
            >
              <FaArrowLeft /> Back
            </button>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center justify-center xl:justify-start gap-3 text-center xl:text-left">
              <span className="w-6 h-[1px] bg-[#BA995D]" /> Booking
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2 text-center xl:text-left">New Booking</h1>
            <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] max-w-md leading-relaxed text-center xl:text-left mx-auto xl:mx-0">
               Create a new member or guest booking.
            </p>
          </div>

          {/* Stat Strip - Premium Design */}
          <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl min-w-[280px]">
             <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <span className="text-lg font-black tracking-tighter text-white">{selectedSlot ? selectedSlot.tableName : '—'}</span>
              <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Target Unit</span>
            </div>
            <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <span className="text-lg font-black tracking-tighter text-[#BA995D] drop-shadow-[0_0_10px_rgba(186,153,93,0.3)]">{selectedSlot ? selectedSlot.time : 'SELECT'}</span>
              <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Temporal Slot</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-16 flex flex-col gap-6 relative z-20 -mt-8">
        
        {/* Step 1: Date + Venue + Table Selectors */}
        <div className="p-4 md:p-6 border border-gray-50 shadow-xl shadow-[#132F45]/5 bg-white rounded-[1.5rem] md:rounded-[2rem]">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FDF2D1] text-[#BA995D] rounded-lg text-[7.5px] font-black uppercase tracking-widest mb-4 shadow-inner">
            Step 1: Selection
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Date */}
            <div className="flex flex-col gap-2">
              <label className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest pl-1">Date</label>
              <input
                type="date"
                className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px]"
                value={selectedDate}
                onChange={(e) => { 
                  let val = e.target.value;
                  const parts = val.split('-');
                  if (parts[0] && parts[0].length > 4) {
                    parts[0] = parts[0].slice(0, 4);
                    val = parts.join('-');
                  }
                  setSelectedDate(val); 
                  setSelectedSlot(null); 
                }}
              />
            </div>

            {/* Venue */}
            <div className="flex flex-col gap-2">
              <label className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest pl-1">Venue</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BA995D]">
                  <FaMapMarkerAlt className="text-[9px]" />
                </div>
                <select
                  value={selectedVenueId || ''}
                  onChange={(e) => { setSelectedVenueId(e.target.value); setSelectedSlot(null); }}
                  className="w-full pl-8 pr-8 py-3 appearance-none bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px]"
                >
                  {slotData.venues.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                <FaChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#BA995D] pointer-events-none text-[7px]" />
              </div>
            </div>

            {/* Table */}
            <div className="flex flex-col gap-2">
              <label className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest pl-1">Table</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BA995D]">
                  <FaTable className="text-[9px]" />
                </div>
                <select
                  value={selectedTableId || ''}
                  onChange={(e) => { setSelectedTableId(e.target.value); setSelectedSlot(null); }}
                  className={`w-full pl-8 pr-8 py-3 appearance-none bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px] ${!selectedVenueId ? 'opacity-40 cursor-not-allowed' : ''}`}
                  disabled={!selectedVenueId}
                >
                  {venueTables.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <FaChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#BA995D] pointer-events-none text-[7px]" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
          {/* Left Column: Slots Grid */}
          <div className="p-4 md:p-6 border border-gray-50 shadow-xl shadow-[#132F45]/5 bg-white rounded-[1.5rem] md:rounded-[2rem]">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FDF2D1] text-[#BA995D] rounded-lg text-[7.5px] font-black uppercase tracking-widest mb-3 shadow-inner">
              Step 2: Select a Slot
            </div>
            <h2 className="text-[8px] font-black text-[#132F45] mb-4 uppercase tracking-[0.25em] flex items-center gap-2">
              <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> 
              {currentTable ? `Available Slots for ${currentTable.name}` : 'Select a table to see slots'}
            </h2>
            
            {!currentTable || activeTableIndex === -1 ? (
              <p className="text-center py-10 text-gray-400 font-bold text-[9px] uppercase tracking-widest italic bg-[#FAFAFA] rounded-2xl border border-dashed border-gray-200">
                Select a venue and table above to view available slots.
              </p>
            ) : relevantTimeSlots.length === 0 ? (
              <p className="text-center py-10 text-gray-400 font-bold text-[9px] uppercase tracking-widest italic bg-[#FAFAFA] rounded-2xl border border-dashed border-gray-200">
                No active slots configured for this table on this date.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {relevantTimeSlots.map(ts => {
                  const status = ts.tableStatus[activeTableIndex];
                  const isSelected = selectedSlot?.time === ts.time;
                  const isBooked = status?.status === 'booked';

                  return (
                    <button
                      key={ts.id}
                      type="button"
                      disabled={isBooked}
                      onClick={() => handleSlotSelect(ts)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-center transition-all active:scale-95 outline-none ${
                        isSelected
                          ? 'bg-[#BA995D] border-[#BA995D] text-white shadow-lg shadow-[#BA995D]/20 ring-2 ring-[#BA995D]/20'
                          : isBooked
                          ? 'bg-red-50 border-red-100 text-red-400 cursor-not-allowed opacity-60'
                          : 'bg-[#FAFAFA] border-gray-100 text-[#132F45] hover:border-[#BA995D] hover:shadow-sm'
                      }`}
                    >
                      <FaClock className={`text-[8px] ${isSelected ? 'text-white' : isBooked ? 'text-red-300' : 'text-[#BA995D]'}`} />
                      <span className="text-[8px] font-black tracking-tighter tabular-nums">{ts.time}</span>
                      <div className={`text-[6px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                        isSelected ? 'bg-white/20 text-white' :
                        isBooked ? 'bg-red-100 text-red-500' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {isBooked ? 'Booked' : 'Available'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Form */}
          <div className="p-6 md:p-8 bg-white sticky top-6 self-start border border-gray-50 shadow-2xl shadow-[#132F45]/10 rounded-[2rem]">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FDF2D1] text-[#BA995D] rounded-lg text-[7.5px] font-black uppercase tracking-widest mb-4 shadow-inner">
               Step 3: Details
            </div>
            <h2 className="text-[8px] font-black text-[#132F45] mb-8 uppercase tracking-[0.25em] flex items-center gap-2">
              <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> Client Manifest
            </h2>
          
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="group">
                <label className="block text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1.5 group-focus-within:text-[#BA995D] transition-colors pl-1">Member Name</label>
                <input
                  type="text"
                  placeholder="EX: JOHN SMITH"
                  className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-black text-[#132F45] text-[10px] placeholder:text-gray-200"
                  value={formData.memberName}
                  onChange={(e) => {
                    const filteredValue = e.target.value.replace(/[^A-Za-z\s]/g, '').slice(0, 50);
                    setFormData({...formData, memberName: filteredValue});
                  }}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="group">
                  <label className="block text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1.5 group-focus-within:text-[#BA995D] transition-colors pl-1">Phone</label>
                  <input
                    type="text"
                    placeholder="PHONE"
                    className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-black text-[#132F45] text-[10px] placeholder:text-gray-200"
                    value={formData.phone}
                    onChange={(e) => {
                      const numericValue = e.target.value.replace(/\D/g, '').slice(0, 11);
                      setFormData({...formData, phone: numericValue});
                    }}
                  />
                </div>
                <div className="group">
                  <label className="block text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1.5 group-focus-within:text-[#BA995D] transition-colors pl-1">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-black text-[#132F45] text-[10px] placeholder:text-gray-200"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                  />
                </div>
              </div>

              <div className="group">
                <label className="block text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1.5 group-focus-within:text-[#BA995D] transition-colors pl-1">Notes</label>
                <textarea
                  placeholder="..."
                  rows="3"
                  className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-black text-[#132F45] resize-none text-[10px] placeholder:text-gray-200"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !selectedSlot}
                  className={`w-full py-2.5 rounded-lg font-black uppercase tracking-[0.2em] text-[8.5px] transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 ${
                    !selectedSlot
                      ? 'bg-gray-100 text-gray-300 border border-gray-50 cursor-not-allowed shadow-none'
                      : 'bg-[#BA995D] text-white hover:bg-[#A3864D] shadow-[#BA995D]/30'
                  }`}
                >
                  {loading ? 'Syncing...' : 'Finalize Reservation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
