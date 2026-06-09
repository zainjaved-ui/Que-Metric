import { useState, useEffect, useContext } from 'react';
import { VenueOwnerContext } from '../../../contexts/VenueOwnerContext';
import Card from '../../ui/Card';
import Alert from '../../ui/Alert';
import Loader from '../../ui/Loader';
import { FaUser, FaBuilding, FaEnvelope, FaPhone } from 'react-icons/fa';

export default function VenueOwnerProfile() {
  const { venueOwner, loading, getProfile, updateProfile } = useContext(VenueOwnerContext);
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch real data on mount
  useEffect(() => {
    getProfile();
  }, []);

  // Populate form when venueOwner data is available
  useEffect(() => {
    if (venueOwner) {
      setFormData({
        name: venueOwner.name || '',
        phoneNumber: venueOwner.phoneNumber || ''
      });
    }
  }, [venueOwner]);

  const initials = venueOwner?.name 
    ? venueOwner.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
    : 'VO';

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Prevent non-numeric characters and limit to 11 digits for phone number
    if (name === 'phoneNumber') {
      const numericValue = value.replace(/\D/g, '').slice(0, 11);
      setFormData(prev => ({ ...prev, [name]: numericValue }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate phone number if provided
    if (formData.phoneNumber && !/^\d{11}$/.test(formData.phoneNumber)) {
      setError('Phone number must be exactly 11 digits.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const result = await updateProfile(formData);
    if (result.success) {
      setSuccess(result.message);
      // Auto-clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } else {
      setError(result.error);
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* ── Hero Header ──────────────────────────────────────────────── */}
      <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
        
        <div className="max-w-4xl w-full mx-auto relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-10">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center justify-center xl:justify-start gap-3 text-center xl:text-left">
              <span className="w-6 h-[1px] bg-[#BA995D]" /> Identity Management
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-3 text-center xl:text-left">My Profile</h1>
            <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] max-w-md leading-relaxed text-center xl:text-left mx-auto xl:mx-0">
               Manage your account settings and contact information.
            </p>
          </div>

          {/* Stat Strip - Premium Design */}
          <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl min-w-[240px]">
             <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <span className="text-lg font-black tracking-tighter text-white">{venueOwner?.name?.[0] || 'V'}</span>
              <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">ID Code</span>
            </div>
            <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <div className="flex flex-col items-center translate-y-0.5">
                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse mb-1"></span>
                <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-[#BA995D] whitespace-nowrap">Active Node</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-16 flex flex-col gap-8 relative z-20 -mt-8">
        {loading && <Loader text="Syncing Profile..." />}
        
        {error && <div className="mb-6 p-3 bg-red-50 border border-red-100 text-red-700 text-[9px] font-black uppercase tracking-widest rounded-xl">{error}</div>}
        {success && <div className="mb-6 p-3 bg-green-50 border border-green-100 text-[#166534] text-[9px] font-black uppercase tracking-widest rounded-xl">{success}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2.5fr] gap-6 items-start">
          {/* Avatar Sidebar */}
          <div className="p-8 border border-gray-50 shadow-2xl shadow-[#132F45]/5 bg-white rounded-[1.5rem] md:rounded-[2rem] flex flex-col items-center text-center">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-[2rem] bg-[#FDF2D1] flex items-center justify-center text-[#BA995D] text-2xl md:text-3xl font-black shadow-inner border-4 border-white mb-6 transform hover:rotate-3 transition-transform">
               {initials}
            </div>
            <h2 className="text-base font-black text-[#132F45] uppercase tracking-tighter leading-none mb-2">{venueOwner?.name || 'Operator'}</h2>
            <div className="bg-[#BA995D] text-white py-0.5 px-4 rounded-lg text-[7px] font-black uppercase tracking-widest shadow-lg shadow-[#BA995D]/20">
                Authorized Venue Owner
            </div>
          </div>

          {/* Form Content */}
          <div className="bg-white border border-gray-50 shadow-2xl shadow-[#132F45]/5 rounded-[1.5rem] md:rounded-[2rem] overflow-hidden">
            <div className="p-8 border-b border-gray-50">
                <h2 className="text-[8px] font-black text-[#132F45] uppercase tracking-[0.25em] flex items-center gap-2">
                  <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> Profile Credentials
                </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Email - Read Only */}
                  <div className="group">
                    <label className="block text-[8.5px] font-black text-gray-400 uppercase tracking-widest mb-1.5 pl-1">System Identifier</label>
                    <input
                      type="email"
                      value={venueOwner?.User?.email || venueOwner?.email || ''}
                      disabled
                      className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-xl text-gray-400 cursor-not-allowed outline-none font-bold text-xs"
                    />
                  </div>

                  {/* Assigned Venue - Read Only */}
                  <div className="group">
                    <label className="block text-[8.5px] font-black text-gray-400 uppercase tracking-widest mb-1.5 pl-1">Primary Assignment</label>
                    <input
                      type="text"
                      value={venueOwner?.venueName || 'Venue'}
                      disabled
                      className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-xl text-gray-400 cursor-not-allowed outline-none font-bold text-xs"
                    />
                  </div>

                  {/* Name - Editable */}
                  <div className="group">
                    <label className="block text-[8.5px] font-black text-gray-400 uppercase tracking-widest mb-1.5 group-focus-within:text-[#BA995D] transition-colors pl-1">Display Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Your full name"
                      className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-xs"
                      required
                    />
                  </div>

                  {/* Phone - Editable */}
                  <div className="group">
                    <label className="block text-[8.5px] font-black text-gray-400 uppercase tracking-widest mb-1.5 group-focus-within:text-[#BA995D] transition-colors pl-1">Contact Routing</label>
                    <input
                      type="tel"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={handleChange}
                      placeholder="Your phone number"
                      className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-xs"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center justify-center gap-2 px-8 py-3 bg-[#BA995D] text-white rounded-xl font-black text-[9px] uppercase tracking-[0.2em] hover:bg-[#A3864D] transition-all shadow-xl shadow-[#BA995D]/20 active:scale-95 disabled:opacity-50"
                  >
                    <FaUser className="text-[10px]" /> 
                    {saving ? 'Syncing...' : 'Save Profile'}
                  </button>
                </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}