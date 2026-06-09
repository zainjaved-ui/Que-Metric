import React, { useState, useEffect } from 'react';
import apiClient from '../../../contexts/apiClient';
import { FaCheck, FaTimes, FaCalendarAlt, FaFilter, FaMapMarkerAlt } from 'react-icons/fa';
import Loader from '../../ui/Loader';

const LeagueRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [filters, setFilters] = useState({ search: '', venue: 'All', status: 'All' });

    const [showRejectionModal, setShowRejectionModal] = useState(false);
    const [selectedRequestId, setSelectedRequestId] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await apiClient.get('/venue-owner/league-requests');
            if (response.data.success) {
                setRequests(response.data.data || []);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to fetch league requests');
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (requestId, action, reason = null) => {
        try {
            setActionLoading(requestId);
            const endpoint = action === 'approve'
                ? `/venue-owner/league-requests/${requestId}/approve`
                : `/venue-owner/league-requests/${requestId}/reject`;

            const response = await apiClient.put(endpoint, { rejectionReason: reason });

            if (response.data.success) {
                // Update local state to reflect change
                setRequests(prev => prev.map(req =>
                    req.id === requestId
                        ? { 
                            ...req, 
                            status: action === 'approve' ? 'approved' : 'rejected',
                            rejectionReason: reason 
                          }
                        : req
                ));

                if (action === 'reject') {
                    setShowRejectionModal(false);
                    setRejectionReason('');
                    setSelectedRequestId(null);
                }
            }
        } catch (err) {
            alert(err.response?.data?.error || `Failed to ${action} request`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRejectClick = (requestId) => {
        setSelectedRequestId(requestId);
        setShowRejectionModal(true);
    };

    if (loading) return <Loader text="Fetching Requests..." />;

    // Unique venue names from all requests for the filter dropdown
    const uniqueVenues = [...new Set(requests.map(r => r.venueName).filter(Boolean))];

    // Apply filters
    const filteredRequests = requests.filter(r => {
        if (filters.venue !== 'All' && r.venueName !== filters.venue) return false;
        if (filters.status !== 'All' && r.status !== filters.status.toLowerCase()) return false;
        if (filters.search) {
            const s = filters.search.toLowerCase();
            const orgName = (r.requestingOrganization?.organizationName || r.requestingEntityName || '').toLowerCase();
            const leagueName = (r.leagueName || '').toLowerCase();
            if (!orgName.includes(s) && !leagueName.includes(s)) return false;
        }
        return true;
    });

    const pendingRequests = filteredRequests.filter(r => r.status === 'pending');
    const pastRequests = filteredRequests.filter(r => r.status !== 'pending');

    return (
        <div className="min-h-screen bg-[#FAFAFA]">
            {/* ── Hero Header ──────────────────────────────────────────────── */}
            <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden flex items-center justify-center">
                <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
                
                <div className="max-w-5xl w-full mx-auto relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-10">
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center justify-center xl:justify-start gap-3 text-center xl:text-left">
                            <span className="w-6 h-[1px] bg-[#BA995D]" /> Requests
                        </p>
                        <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2 text-center xl:text-left">League Requests</h1>
                        <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] max-w-md leading-relaxed text-center xl:text-left mx-auto xl:mx-0">
                            Review and manage requests from organizations.
                        </p>
                    </div>

                    {/* Stat Strip - Premium Design */}
                    <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl min-w-[240px]">
                        <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
                            <span className="text-lg font-black tracking-tighter text-white">{pendingRequests.length}</span>
                            <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Pending Action</span>
                        </div>
                        <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
                            <button 
                                onClick={fetchRequests}
                                className="text-[10px] text-[#BA995D] hover:text-white transition-colors"
                            >
                                <span className="text-lg font-black tracking-tighter block leading-none">SYNC</span>
                                <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Update Feed</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 md:py-16 flex flex-col gap-8 relative z-20 -mt-8">
                {error && (
                    <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest mb-6">
                        {error}
                    </div>
                )}

                {/* Filter Bar */}
                <div className="p-4 bg-white border border-gray-50 shadow-xl shadow-[#132F45]/5 rounded-[1.5rem] md:rounded-[2rem]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                        {/* Search */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest pl-1">Search</label>
                            <div className="relative">
                                <FaFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BA995D] text-[9px] opacity-50" />
                                <input
                                    type="text"
                                    placeholder="Org or league name..."
                                    className="w-full pl-9 pr-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px]"
                                    value={filters.search}
                                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Venue */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest pl-1">Venue</label>
                            <div className="relative">
                                <FaMapMarkerAlt className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BA995D] text-[9px]" />
                                <select
                                    className="w-full pl-9 pr-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px] appearance-none"
                                    value={filters.venue}
                                    onChange={(e) => setFilters({ ...filters, venue: e.target.value })}
                                >
                                    <option value="All">All Venues</option>
                                    {uniqueVenues.map(v => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Status */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest pl-1">Status</label>
                            <select
                                className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-[#132F45] text-[10px] appearance-none"
                                value={filters.status}
                                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                            >
                                <option value="All">All Status</option>
                                <option value="Pending">Pending</option>
                                <option value="Approved">Approved</option>
                                <option value="Rejected">Rejected</option>
                            </select>
                        </div>

                        {/* Reset */}
                        <div className="flex items-end">
                            <button
                                onClick={() => setFilters({ search: '', venue: 'All', status: 'All' })}
                                className="w-full px-4 py-2.5 border border-gray-100 text-[#132F45] bg-[#FAFAFA] rounded-2xl hover:bg-gray-100 transition-all font-black text-[8px] uppercase tracking-widest active:scale-95 shadow-sm"
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </div>

            {/* Rejection Modal */}
            {showRejectionModal && (
                <div className="fixed inset-0 bg-[#132F45]/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border border-white/20">
                        <div className="p-8">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-red-500 mb-3 flex items-center gap-2">
                                <span className="w-4 h-[1px] bg-red-500" /> Action Required
                            </p>
                            <h2 className="text-2xl font-black mb-2 text-[#132F45] uppercase tracking-tighter">Reject Request</h2>
                            <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-6">Briefly explain the decision for record-keeping.</p>
                            
                            <div className="mb-6">
                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2 pl-1">
                                    Rejection Reason
                                </label>
                                <textarea
                                    className="w-full bg-[#FAFAFA] border border-gray-100 rounded-xl p-4 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all resize-none text-xs font-bold text-[#132F45]"
                                    rows="3"
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    placeholder="e.g. Schedule conflict..."
                                ></textarea>
                            </div>
                            
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowRejectionModal(false);
                                        setRejectionReason('');
                                    }}
                                    className="flex-1 px-4 py-3.5 text-[8.5px] font-black uppercase tracking-widest text-gray-500 bg-[#FAFAFA] border border-gray-50 hover:bg-gray-100 rounded-xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    disabled={actionLoading === selectedRequestId}
                                    onClick={() => handleAction(selectedRequestId, 'reject', rejectionReason)}
                                    className="flex-1 px-4 py-3.5 text-[8.5px] font-black uppercase tracking-widest text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-red-600/20"
                                >
                                    {actionLoading === selectedRequestId ? 'Processing...' : 'Confirm Reject'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Pending Requests Section */}
            <section>
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-[8px] font-black text-[#132F45] uppercase tracking-[0.25em] flex items-center gap-2">
                      <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> Pending Approvals
                    </h2>
                    <span className="bg-[#FDF2D1] text-[#BA995D] px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest shadow-sm ring-1 ring-[#BA995D]/10">
                        {pendingRequests.length} Total
                    </span>
                </div>

                {pendingRequests.length === 0 ? (
                    <div className="bg-white rounded-[1.5rem] p-12 text-center border border-gray-100 shadow-xl shadow-[#132F45]/5">
                        <div className="w-12 h-12 bg-[#FAFAFA] rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                             <FaCalendarAlt className="h-5 w-5 text-[#BA995D]/20" />
                        </div>
                        <p className="text-[#132F45] font-black text-xs uppercase tracking-tight">Clean Slate</p>
                        <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest mt-1">No pending league requests to review.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {pendingRequests.map(request => (
                            <RequestCard
                                key={request.id}
                                request={request}
                                onApprove={() => handleAction(request.id, 'approve')}
                                onReject={() => handleRejectClick(request.id)}
                                actionLoading={actionLoading === request.id}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Past Requests Section */}
            {pastRequests.length > 0 && (
                <section>
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-[8px] font-black text-[#132F45] uppercase tracking-[0.25em] flex items-center gap-2">
                          <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> Decision History
                        </h2>
                    </div>

                    <div className="bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-2xl shadow-[#132F45]/5 border border-gray-50 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-left">
                                <thead>
                                    <tr className="bg-[#FAFAFA] border-b border-gray-50">
                                        <th className="px-6 py-4 text-[7px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                                        <th className="px-6 py-4 text-[7px] font-black text-gray-400 uppercase tracking-widest">Organization</th>
                                        <th className="px-6 py-4 text-[7px] font-black text-gray-400 uppercase tracking-widest">Venue</th>
                                        <th className="px-6 py-4 text-center text-[7px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {pastRequests.map(request => (
                                        <tr key={request.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="px-4 py-2.5 whitespace-nowrap text-[9px] text-[#BA995D] font-black tabular-nums">
                                                {new Date(request.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 h-5 bg-[#FDF2D1] rounded flex items-center justify-center text-[#BA995D] font-black text-[8px] uppercase">
                                                        {(request.requestingOrganization?.organizationName || request.requestingEntityName)[0]}
                                                    </div>
                                                    <span className="text-[9px] font-black text-[#132F45] uppercase tracking-tight group-hover:text-[#BA995D]">
                                                        {request.requestingOrganization?.organizationName || request.requestingEntityName}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 whitespace-nowrap text-[9px] text-gray-400 font-bold uppercase tracking-tight">
                                                {request.venueName || 'N/A'}
                                            </td>
                                            <td className="px-4 py-2.5 whitespace-nowrap text-center">
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <span className={`px-1.5 py-0.5 inline-flex text-[7px] font-black rounded uppercase tracking-widest shadow-sm ring-1 ring-inset ${
                                                        request.status === 'approved'
                                                            ? 'bg-[#EBF5EE] text-[#2D6A4F] ring-[#B7E4C7]'
                                                            : 'bg-[#FDF2F2] text-[#9B1C1C] ring-[#FDE2E2]'
                                                        }`}>
                                                        {request.status}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}
            </div>
        </div>
    );
};

const RequestCard = ({ request, onApprove, onReject, actionLoading }) => (
    <div className="bg-white rounded-[1.25rem] border border-gray-100 p-4 flex flex-col h-full transition-all hover:shadow-2xl shadow-xl shadow-[#132F45]/5 group relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#FDF2D1]/10 rounded-bl-full -mr-8 -mt-8 group-hover:bg-[#FDF2D1]/20 transition-all pointer-events-none"></div>
        <div className="flex-1 relative z-10">
            <div className="flex justify-between items-start mb-3">
                <div className="w-9 h-9 bg-[#FAFAFA] border border-gray-50 rounded-xl flex items-center justify-center text-[#BA995D] font-black text-xs shadow-inner group-hover:bg-[#FDF2D1] transition-colors shrink-0">
                    {(request.requestingOrganization?.organizationName || request.requestingEntityName)[0].toUpperCase()}
                </div>
                <span className="bg-[#BA995D] text-white text-[6.5px] font-black px-2 py-0.5 rounded uppercase tracking-[0.2em] shadow-sm">
                    {request.leagueName ? 'League' : 'Club'}
                </span>
            </div>

            <h3 className="font-black text-[11px] text-[#132F45] mb-4 leading-tight uppercase tracking-tight group-hover:text-[#BA995D]">
                {request.requestingOrganization?.organizationName || request.requestingEntityName}
            </h3>

            <div className="space-y-2.5">
                <div className="flex flex-col">
                    <span className="text-[6.5px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Assigned Venue</span>
                    <span className="text-[8.5px] font-black text-[#132F45] tracking-tight uppercase">{request.venueName || 'Primary Site'}</span>
                </div>
                
                {request.leagueName && (
                    <div className="flex flex-col">
                        <span className="text-[6.5px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Tournament Name</span>
                        <span className="text-[8.5px] font-black text-[#BA995D] uppercase tracking-widest leading-none bg-[#FDF2D1]/50 px-2 py-1 rounded inline-block w-fit">{request.leagueName}</span>
                    </div>
                )}
            </div>
        </div>

        <div className="mt-5 flex gap-2 pt-4 border-t border-gray-50 relative z-10">
            <button
                onClick={onReject}
                disabled={actionLoading}
                className="flex-1 px-3 py-2 bg-[#FAFAFA] border border-gray-100 text-red-500 rounded-lg hover:bg-red-50 transition-all disabled:opacity-50 text-[7.5px] font-black uppercase tracking-widest active:scale-95"
            >
                Reject
            </button>
            <button
                onClick={onApprove}
                disabled={actionLoading}
                className="flex-1 px-3 py-2 bg-[#BA995D] text-white rounded-lg hover:bg-[#A3864D] transition-all disabled:opacity-50 text-[7.5px] font-black uppercase tracking-widest shadow-md active:scale-95"
            >
                Approve
            </button>
        </div>
    </div>
);

export default LeagueRequests;
