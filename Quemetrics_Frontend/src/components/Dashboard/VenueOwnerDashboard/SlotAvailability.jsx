import { useContext, useEffect, useState } from 'react';
import { VenueOwnerContext } from '../../../contexts/VenueOwnerContext';
import Loader from '../../ui/Loader';
import { FaChevronLeft, FaChevronRight, FaCalendar, FaMapMarkerAlt, FaTable, FaChevronDown } from 'react-icons/fa';

export default function SlotAvailability() {
  const { loading, getSlotAvailability } = useContext(VenueOwnerContext);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [slotData, setSlotData] = useState(null);
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [selectedTableId, setSelectedTableId] = useState(null);

  useEffect(() => {
    loadSlotData();
  }, [selectedDate]);

  const loadSlotData = async () => {
    const result = await getSlotAvailability(selectedDate);
    if (result.success) {
      setSlotData(result.data);
      
      // Auto-select first venue if none selected
      if (result.data.venues?.length > 0 && !selectedVenueId) {
        setSelectedVenueId(String(result.data.venues[0].id));
        if (result.data.venues[0].tables?.length > 0) {
          setSelectedTableId(String(result.data.venues[0].tables[0].id));
        }
      }
    }
  };

  const data = slotData || {
    venueName: 'Venue',
    tables: [],
    timeSlots: [],
    venues: []
  };

  // Sync table selection when venue changes
  useEffect(() => {
    if (selectedVenueId && data.venues) {
      const venue = data.venues.find(v => String(v.id) === String(selectedVenueId));
      if (venue && venue.tables?.length > 0) {
        // If current selectedTableId is not in this venue, select the first one
        const tableInVenue = venue.tables.find(t => String(t.id) === String(selectedTableId));
        if (!tableInVenue) {
          setSelectedTableId(String(venue.tables[0].id));
        }
      }
    }
  }, [selectedVenueId, data.venues]);

  const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getDayName = (date) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  };

  const changeDate = (days) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  // Positional offset approach - reliable across multiple venues
  const venueIndex = data.venues?.findIndex(v => String(v.id) === String(selectedVenueId)) ?? -1;
  const currentVenue = venueIndex >= 0 ? data.venues[venueIndex] : null;
  const venueTables = currentVenue ? currentVenue.tables : [];
  const tableIndexInVenue = venueTables.findIndex(t => String(t.id) === String(selectedTableId));
  const currentTable = tableIndexInVenue >= 0 ? venueTables[tableIndexInVenue] : null;

  // Sum up all tables from preceding venues to get the correct flat index
  const venueOffset = venueIndex >= 0
    ? (data.venues?.slice(0, venueIndex) || []).reduce((sum, v) => sum + (v.tables?.length || 0), 0)
    : 0;
  const tableIndex = tableIndexInVenue >= 0 ? venueOffset + tableIndexInVenue : -1;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* ── Hero Header ──────────────────────────────────────────────── */}
      <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
        
        <div className="max-w-5xl w-full mx-auto relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-10">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center justify-center xl:justify-start gap-3 text-center xl:text-left">
              <span className="w-6 h-[1px] bg-[#BA995D]" /> Resource Scheduling
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2 text-center xl:text-left">Slot Availability</h1>
            <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] max-w-md leading-relaxed text-center xl:text-left mx-auto xl:mx-0">
               Real-time status of your tables and slots.
            </p>
          </div>

          {/* Stat Strip - Premium Design */}
          <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl min-w-[240px]">
             <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <span className="text-lg font-black tracking-tighter text-white">{venueTables.length || data.tables.length}</span>
              <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Available Tables</span>
            </div>
            <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <button 
                onClick={loadSlotData}
                className="text-[10px] text-[#BA995D] hover:text-white transition-colors"
              >
                <span className="text-lg font-black tracking-tighter block leading-none">SYNC</span>
                <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Refresh Grid</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 md:py-16 flex flex-col gap-6 relative z-20 -mt-8">
        {loading && <Loader text="Checking Slots..." />}

        {/* Filters Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm items-end">
          {/* Venue Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-[8px] font-black text-[#132F45] uppercase tracking-[0.2em] px-1">1. Select Venue</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#BA995D]">
                <FaMapMarkerAlt className="text-[10px]" />
              </div>
              <select 
                value={selectedVenueId}
                onChange={(e) => setSelectedVenueId(e.target.value)}
                className="w-full appearance-none bg-[#FAFAFA] border border-gray-100 text-[#132F45] text-[10px] font-black uppercase tracking-widest pl-10 pr-10 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#BA995D] transition-all cursor-pointer hover:bg-gray-50"
              >
                {data.venues?.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <FaChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-[#BA995D] pointer-events-none text-[8px]" />
            </div>
          </div>

          {/* Table Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-[8px] font-black text-[#132F45] uppercase tracking-[0.2em] px-1">2. Select Table</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#BA995D]">
                <FaTable className="text-[10px]" />
              </div>
              <select 
                value={selectedTableId}
                onChange={(e) => setSelectedTableId(e.target.value)}
                className="w-full appearance-none bg-[#FAFAFA] border border-gray-100 text-[#132F45] text-[10px] font-black uppercase tracking-widest pl-10 pr-10 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#BA995D] transition-all cursor-pointer hover:bg-gray-50"
              >
                {venueTables.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <FaChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-[#BA995D] pointer-events-none text-[8px]" />
            </div>
          </div>

          {/* Date Selector */}
          <div className="flex items-center justify-between bg-[#FAFAFA] border border-gray-100 rounded-xl p-1.5">
            <button onClick={() => changeDate(-1)} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-100 rounded-lg text-[#132F45] hover:text-[#BA995D] transition-all shadow-sm">
              <FaChevronLeft className="text-[8px]" />
            </button>
            <div className="text-center px-4">
              <p className="text-[7px] font-black text-[#BA995D] uppercase tracking-widest leading-none mb-0.5">{getDayName(selectedDate)}</p>
              <p className="text-[10px] font-black text-[#132F45] uppercase tracking-tighter leading-none">{formatDate(selectedDate)}</p>
            </div>
            <button onClick={() => changeDate(1)} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-100 rounded-lg text-[#132F45] hover:text-[#BA995D] transition-all shadow-sm">
              <FaChevronRight className="text-[8px]" />
            </button>
          </div>
        </div>

        {/* Availability Display */}
        <div className="bg-white border border-gray-50 shadow-xl shadow-[#132F45]/5 rounded-[1.5rem] md:rounded-[2rem] overflow-hidden relative">
          <div className="px-6 py-4 border-b border-gray-50 bg-[#FAFAFA]/50 flex items-center justify-between">
            <h2 className="text-[8px] font-black text-[#132F45] uppercase tracking-[0.25em] flex items-center gap-2">
              <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> 
              {currentTable ? `Slots for ${currentTable.name}` : 'Temporal Grid'}
            </h2>
            <div className="flex items-center gap-3">
               <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-[6px] font-black uppercase tracking-widest text-gray-400">Available</span>
               </div>
               <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span className="text-[6px] font-black uppercase tracking-widest text-gray-400">Booked</span>
               </div>
            </div>
          </div>
          
          <div className="p-6">
            {tableIndex === -1 ? (
              <div className="text-center py-20">
                <p className="text-[10px] font-black text-[#132F45]/30 uppercase tracking-[0.2em]">Select a table to view slots</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {data.timeSlots.map((slot, slotIndex) => {
                  const status = slot.tableStatus[tableIndex];
                  if (!status || status.status === 'unavailable') return null;

                  return (
                    <div key={slotIndex} className={`group relative p-3 rounded-2xl border transition-all duration-300 flex flex-col items-center justify-center gap-2 ${
                      status.status === 'booked' 
                        ? 'bg-red-50 border-red-100 opacity-80' 
                        : status.status === 'pending'
                        ? 'bg-amber-50 border-amber-100'
                        : 'bg-green-50 border-green-100 hover:shadow-lg hover:shadow-green-500/10 cursor-pointer'
                    }`}>
                      <span className={`text-[8px] font-black tracking-tighter tabular-nums ${
                        status.status === 'booked' ? 'text-red-900' : 
                        status.status === 'pending' ? 'text-amber-900' : 
                        'text-green-900'
                      }`}>
                        {slot.time}
                      </span>
                      
                      <div className={`px-2 py-0.5 rounded-lg text-[6px] font-black uppercase tracking-widest ${
                        status.status === 'booked' ? 'bg-red-200/50 text-red-700' : 
                        status.status === 'pending' ? 'bg-amber-200/50 text-amber-700' : 
                        'bg-green-200/50 text-green-700'
                      }`}>
                        {status.status}
                      </div>

                      {status.playerName && (
                        <div className="absolute inset-0 bg-[#132F45] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center">
                           <p className="text-[8px] font-black text-white uppercase tracking-tight truncate w-full">
                              {status.playerName}
                           </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}