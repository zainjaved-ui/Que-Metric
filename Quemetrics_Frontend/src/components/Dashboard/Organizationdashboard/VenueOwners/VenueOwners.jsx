import { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { FaCheck, FaTimes, FaInfoCircle } from 'react-icons/fa';
// import { useOrganization } from '../../../../hooks/useOrganization';
import { OrganizationContext } from '../../../../contexts/OrganizationContext';
import Button from '../../../ui/Button';
import Input from '../../../ui/Input';
import Card from '../../../ui/Card';
import Alert from '../../../ui/Alert';
import Loader from '../../../ui/Loader';

export default function VenueOwners() {
  const {
    venueOwners,
    venues,
    loading,
    getVenueOwners,
    inviteVenueOwner,
    removeVenueOwner,
    getVenues,
  } = useContext(OrganizationContext);

  // Invite modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inviteData, setInviteData] = useState({
    email: '',
    name: '',
    phoneNumber: '',
    venueIds: [], // store selected venue IDs
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviting, setInviting] = useState(false);

  // Compute venues that are not already assigned to any venue owner
  // This prevents the same venue from being assigned to multiple venue owners
  const assignedVenueIds = (venueOwners || []).reduce((acc, vo) => {
    if (Array.isArray(vo.venueIds) && vo.venueIds.length > 0) {
      vo.venueIds.forEach(id => acc.add(id));
    }
    return acc;
  }, new Set());

  // Filter to show only venues that haven't been assigned yet
  const availableVenuesForInvite = (venues || []).filter(v => !assignedVenueIds.has(v.id));

  // Fetch both owners and venues on mount
  useEffect(() => {
    (async () => {
      await getVenueOwners();
      if (getVenues) {
        await getVenues(); // fetch available venues from user's clubs only
      }
    })();
  }, []);

  const openModal = () => {
    setInviteData({ email: '', name: '', phoneNumber: '', venueIds: [] });
    setError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setError('');
  };

  const handleCheckboxChange = (venueId) => {
    setInviteData((prev) => {
      const alreadySelected = prev.venueIds.includes(venueId);
      const updated = alreadySelected
        ? prev.venueIds.filter((id) => id !== venueId)
        : [...prev.venueIds, venueId];
      return { ...prev, venueIds: updated };
    });
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate name
    if (!/^[A-Za-z\s]+$/.test(inviteData.name)) {
      setError('Name must only contain alphabets and spaces.');
      return;
    }
    if (inviteData.name.length > 50) {
      setError('Name must not exceed 50 characters.');
      return;
    }

    // Validate phone number if provided
    if (inviteData.phoneNumber && !/^\d{11}$/.test(inviteData.phoneNumber)) {
      setError('Phone number must be exactly 11 digits.');
      return;
    }

    setInviting(true);

    // Validate that at least one venue is selected
    if (inviteData.venueIds.length === 0) {
      setError('Please select at least one venue.');
      setInviting(false);
      return;
    }

    const result = await inviteVenueOwner(inviteData); // now includes venueIds

    if (result.success) {
      setSuccess(result.message);
      setInviteData({ email: '', name: '', phoneNumber: '', venueIds: [] });
      closeModal();
      // Refresh venue owners list - this will recalculate which venues are available
      await getVenueOwners();
    } else {
      setError(result.error);
    }

    setInviting(false);
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Are you sure you want to remove this venue owner?')) return;

    const result = await removeVenueOwner(id);
    if (result.success) {
      setSuccess(result.message);
      getVenueOwners(); // refresh list
    } else {
      setError(result.error);
    }
  };

  if (loading && !venueOwners.length) return <Loader />;

  return (
    <div className="p-3 sm:p-4 md:p-6 flex flex-col gap-4 sm:gap-6">
      {/* ── Premium Hero Header ────────────────────────────────────────── */}
      <div className="bg-[#132F45] rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-xl shadow-[#132F45]/15 border border-[#BA995D]/10">
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#BA995D]/5 rounded-bl-full -mr-16 -mt-16 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-tr-3xl -ml-8 -mb-8 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col gap-4 sm:gap-6">
          <div className="max-w-2xl">
            <p className="text-[7px] sm:text-[7.5px] font-black uppercase tracking-[0.3em] text-[#BA995D] mb-2 flex items-center gap-2">
              <span className="w-5 h-[1px] bg-[#BA995D]" /> Administration Detail
            </p>
            <h1 className="text-lg sm:text-xl md:text-2xl font-black text-white uppercase tracking-tighter mb-2">
              Venue <span className="text-[#BA995D]">Owners</span>
            </h1>
            <p className="text-[9px] sm:text-[10px] md:text-[11px] text-[#DCEAF8]/60 leading-relaxed font-medium">
              Manage the administrators who oversee your facilities. Track invitations, monitor active status, and maintain resource oversight from a single point of control.
            </p>
          </div>

          <div className="flex flex-col xs:flex-row gap-2.5 items-stretch xs:items-center">
            <button
              onClick={openModal}
              className="inline-flex items-center justify-center gap-2.5 px-4 sm:px-5 py-2.5 bg-[#BA995D] text-[#132F45] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-[#132F45]/20 hover:bg-[#d4b877] transition-all disabled:opacity-50 text-[8px] sm:text-[9px] whitespace-nowrap"
            >
              Invite Owner
            </button>
            <Link to="/organization/dashboard" className="inline-flex items-center justify-center gap-2.5 px-4 sm:px-5 py-2.5 bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all text-[8px] sm:text-[9px] whitespace-nowrap">
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {/* Existing Venue owners list */}
      <Card className="overflow-hidden border border-gray-50 shadow-xl shadow-[#132F45]/5 outline outline-1 outline-[#FDF2D1] rounded-xl">
        <div className="p-3 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div className="min-w-0">
              <h2 className="text-sm sm:text-[14px] font-black text-[#132F45] uppercase tracking-tight mb-1">Administrative Registry</h2>
              <p className="text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Manage {venueOwners.length} facility administrators
              </p>
            </div>
            <div className="bg-[#132F45] text-white px-3 py-1 rounded-full text-[8px] font-black shadow-sm whitespace-nowrap flex-shrink-0">
              {venueOwners.length} Active
            </div>
          </div>
          {venueOwners.length === 0 ? (
            <div className="py-12 text-center bg-[#FAFAFA] rounded-xl border border-dashed border-[#FDF2D1]">
              <FaInfoCircle className="mx-auto text-[#BA995D] mb-3" size={24} />
              <p className="text-gray-500 font-black uppercase tracking-widest text-[9px]">No venue owners registered yet.</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full border-collapse min-w-full">
                  <thead>
                    <tr className="border-b border-gray-50 bg-[#FAFAFA]/50">
                      <th className="text-left py-2.5 px-3 text-[8px] font-black text-[#BA995D] uppercase tracking-widest">Administrator</th>
                      <th className="text-left py-2.5 px-3 text-[8px] font-black text-[#BA995D] uppercase tracking-widest">Facilities</th>
                      <th className="text-left py-2.5 px-3 text-[8px] font-black text-[#BA995D] uppercase tracking-widest">Contact Identity</th>
                      <th className="text-left py-2.5 px-3 text-[8px] font-black text-[#BA995D] uppercase tracking-widest">Status</th>
                      <th className="text-right py-2.5 px-3 text-[8px] font-black text-[#BA995D] uppercase tracking-widest">Controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {venueOwners.map((vo) => {
                      const email = (vo.User && vo.User.email) || vo.email || '-';
                      const phone = vo.phoneNumber || '-';
                      return (
                        <tr key={vo.id} className="border-b border-gray-50 hover:bg-[#FAFAFA] transition-colors group">
                          <td className="py-3 px-3">
                            <p className="text-[10px] sm:text-[11px] font-black text-[#132F45] uppercase tracking-tight">{vo.name}</p>
                          </td>

                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1">
                              {vo.venueIds && vo.venueIds.length > 0 ? (
                                vo.venueIds.map((id) => {
                                  const matchedVenue = venues?.find((v) => v.id === id);
                                  return (
                                    <span key={id} className="bg-[#BA995D]/10 text-[#BA995D] px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-tighter">
                                      {matchedVenue ? matchedVenue.name : 'Unknown'}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-gray-300 text-[7px] sm:text-[8px] italic uppercase tracking-widest">No venues</span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <div className="flex flex-col min-w-0">
                              <span className="text-[9px] sm:text-[10px] font-bold text-gray-600 truncate">{email}</span>
                              <span className="text-[7px] sm:text-[8px] font-black text-gray-400 tracking-widest uppercase">{phone}</span>
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[7px] sm:text-[7.5px] font-black uppercase tracking-widest whitespace-nowrap ${
                                vo.isInviteAccepted
                                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm'
                                  : 'bg-amber-50 text-amber-600 border border-amber-100 shadow-sm'
                              }`}
                            >
                              <div className={`w-1 h-1 rounded-full mr-1.5 ${vo.isInviteAccepted ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              {vo.isInviteAccepted ? 'Active' : 'Pending'}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => handleRemove(vo.id)}
                              className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg text-[7px] sm:text-[8px] font-black uppercase tracking-widest transition-all shadow-sm whitespace-nowrap"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="sm:hidden space-y-3">
                {venueOwners.map((vo) => {
                  const email = (vo.User && vo.User.email) || vo.email || '-';
                  const phone = vo.phoneNumber || '-';
                  return (
                    <div key={vo.id} className="bg-white border border-gray-100 rounded-xl p-4 space-y-3 hover:border-[#FDF2D1] transition-colors">
                      {/* Header: Name and Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-black text-[#132F45] uppercase tracking-tight break-words">{vo.name}</p>
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest whitespace-nowrap flex-shrink-0 ${
                            vo.isInviteAccepted
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              : 'bg-amber-50 text-amber-600 border border-amber-100'
                          }`}
                        >
                          <div className={`w-1 h-1 rounded-full mr-1 ${vo.isInviteAccepted ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          {vo.isInviteAccepted ? 'Active' : 'Pending'}
                        </span>
                      </div>

                      {/* Contact Info */}
                      <div className="bg-[#FAFAFA] rounded-lg p-3 space-y-1.5">
                        <div>
                          <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Email</p>
                          <p className="text-[9px] font-bold text-gray-600 break-all">{email}</p>
                        </div>
                        {phone !== '-' && (
                          <div>
                            <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Phone</p>
                            <p className="text-[9px] font-bold text-gray-600">{phone}</p>
                          </div>
                        )}
                      </div>

                      {/* Facilities */}
                      <div>
                        <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-2">Facilities</p>
                        <div className="flex flex-wrap gap-1.5">
                          {vo.venueIds && vo.venueIds.length > 0 ? (
                            vo.venueIds.map((id) => {
                              const matchedVenue = venues?.find((v) => v.id === id);
                              return (
                                <span key={id} className="bg-[#BA995D]/10 text-[#BA995D] px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-tighter">
                                  {matchedVenue ? matchedVenue.name : 'Unknown'}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-gray-300 text-[8px] italic uppercase tracking-widest">No assigned venues</span>
                          )}
                        </div>
                      </div>

                      {/* Action Button */}
                      <button
                        onClick={() => handleRemove(vo.id)}
                        className="w-full bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-3 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all shadow-sm"
                      >
                        Remove Administrator
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Invite Venue Owner Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col">
            {/* Modal Header */}
            <div className="relative bg-[#132F45] px-4 sm:px-6 py-4 sm:py-5 flex-shrink-0">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#BA995D]/10 rounded-bl-full -mr-8 -mt-8 pointer-events-none" />
              <div className="relative z-10 flex justify-between items-start gap-3 sm:items-center">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xs sm:text-sm font-black text-white uppercase tracking-widest pl-2 border-l-2 border-[#BA995D] break-words">
                    Invite Administrator
                  </h2>
                  <p className="text-[7px] sm:text-[8px] font-black text-white/30 uppercase tracking-[0.25em] mt-1 ml-3">
                    Grant facility access
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/10 flex-shrink-0"
                >
                  <FaTimes size={12} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <form onSubmit={handleInvite}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  <div className="md:col-span-2 flex flex-col gap-1.5">
                    <label className="text-[9px] sm:text-[10px] font-black text-[#132F45] uppercase tracking-widest pl-1">Target Identity (Email) *</label>
                    <input
                      type="email"
                      value={inviteData.email}
                      onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                      required
                      className="w-full bg-[#FAFAFA] border-2 border-[#FDF2D1] rounded-xl px-3 sm:px-4 py-2.5 font-black text-[10px] sm:text-[11px] text-[#132F45] focus:outline-none focus:border-[#BA995D] transition-all"
                      placeholder="venueowner@example.com"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] sm:text-[10px] font-black text-[#132F45] uppercase tracking-widest pl-1">Full Name *</label>
                    <input
                      type="text"
                      value={inviteData.name}
                      onChange={(e) => {
                        const filteredValue = e.target.value.replace(/[^A-Za-z\s]/g, '').slice(0, 50);
                        setInviteData({ ...inviteData, name: filteredValue });
                      }}
                      required
                      className="w-full bg-[#FAFAFA] border-2 border-[#FDF2D1] rounded-xl px-3 sm:px-4 py-2.5 font-black text-[10px] sm:text-[11px] text-[#132F45] focus:outline-none focus:border-[#BA995D] transition-all"
                      placeholder="John Doe"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] sm:text-[10px] font-black text-[#132F45] uppercase tracking-widest pl-1">Phone Number</label>
                    <input
                      type="tel"
                      value={inviteData.phoneNumber}
                      onChange={(e) => {
                        const numericValue = e.target.value.replace(/\D/g, '').slice(0, 11);
                        setInviteData({ ...inviteData, phoneNumber: numericValue });
                      }}
                      className="w-full bg-[#FAFAFA] border-2 border-[#FDF2D1] rounded-xl px-3 sm:px-4 py-2.5 font-black text-[10px] sm:text-[11px] text-[#132F45] focus:outline-none focus:border-[#BA995D] transition-all"
                      placeholder="e.g. 03001234567"
                    />
                  </div>

                  {/* Venue Selection */}
                  <div className="md:col-span-2">
                    <label className="text-[9px] sm:text-[10px] font-black text-[#132F45] uppercase tracking-widest pl-1 mb-2 block">
                      Assigned Resource Access <span className="text-[#BA995D]">*</span>
                    </label>
                    <div className="max-h-40 overflow-y-auto border-2 border-[#FDF2D1] rounded-xl p-2 sm:p-3 bg-[#FAFAFA] custom-scrollbar">
                      {availableVenuesForInvite.length === 0 ? (
                        <p className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-widest text-center py-6">
                          No available venues.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {availableVenuesForInvite.map((venue) => (
                            <label 
                              key={venue.id} 
                              className={`flex items-start sm:items-center gap-2.5 p-2 rounded-lg border-2 transition-all cursor-pointer ${
                                inviteData.venueIds.includes(venue.id)
                                  ? 'bg-[#132F45] border-[#BA995D] text-white shadow-md'
                                  : 'bg-white border-transparent text-[#132F45] hover:border-[#FDF2D1]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={inviteData.venueIds.includes(venue.id)}
                                onChange={() => handleCheckboxChange(venue.id)}
                                className="hidden"
                              />
                              <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 mt-0.5 sm:mt-0 ${
                                inviteData.venueIds.includes(venue.id) ? 'bg-[#BA995D] border-[#BA995D]' : 'bg-gray-100 border-gray-200'
                              }`}>
                                {inviteData.venueIds.includes(venue.id) && <FaCheck size={8} className="text-white" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-tight block break-words">{venue.name}</span>
                                {venue.address && (
                                  <span className={`text-[7px] sm:text-[7.5px] font-bold block break-words uppercase tracking-widest ${inviteData.venueIds.includes(venue.id) ? 'text-[#BA995D]/60' : 'text-gray-400'}`}>
                                    {venue.address}
                                  </span>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 mt-6 sm:mt-8 pt-4 sm:pt-5 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 sm:px-6 py-2.5 rounded-xl border-2 border-gray-100 text-gray-400 font-black uppercase tracking-widest text-[8px] sm:text-[9px] hover:bg-gray-50 transition-all order-2 sm:order-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting || inviteData.venueIds.length === 0}
                    className="px-4 sm:px-6 py-2.5 rounded-xl bg-[#132F45] text-white font-black uppercase tracking-widest text-[8px] sm:text-[9px] shadow-xl shadow-[#132F45]/20 hover:bg-[#BA995D] transition-all disabled:opacity-50 order-1 sm:order-2"
                  >
                    {inviting ? 'Processing...' : 'Send Invitation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}