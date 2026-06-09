import React, { useState, useEffect } from 'react';
import apiClient from '../../../../contexts/apiClient';
import {
  FaUserPlus,
  FaCheck,
  FaTimes,
  FaHistory,
  FaEnvelope,
  FaCalendarAlt,
  FaFilter,
  FaArrowRight,
  FaUsers,
  FaProjectDiagram
} from 'react-icons/fa';

const JoinRequestsModal = ({ leagueId, leagueName, onClose, onRequestsUpdated }) => {
  const [joinRequests, setJoinRequests] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    fetchJoinRequests();
    fetchDivisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, filter]);

  const fetchJoinRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get(`/leagues/${leagueId}/join-requests`, {
        params: { status: filter !== 'all' ? filter : undefined }
      });
      if (response.data.success) {
        setJoinRequests(response.data.data || []);
      } else {
        setError('Error: Failed to load requests');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const fetchDivisions = async () => {
    try {
      const res = await apiClient.get(`/leagues/${leagueId}/divisions`);
      if (res.data.success) {
        setDivisions(res.data.data || []);
      }
    } catch {
      // Divisions are optional — silently ignore
    }
  };

  // Admin clicks "Approve" (no division picking here; goes direct)
  const handleApproveClick = async (leaguePlayerId) => {
    try {
      setProcessingId(leaguePlayerId);
      const regenerate = confirm('Update the match schedule now? (Recommended for leagues that have already started)');

      const payload = { action: 'approve', regenerateFixtures: regenerate };

      // Auto-assign to Main League if no real divisions exist
      if (divisions && divisions.length === 1) {
        payload.divisionId = divisions[0].id;
      }

      const response = await apiClient.post(
        `/leagues/${leagueId}/join-requests/${leaguePlayerId}/approve`,
        payload
      );

      if (response.data.success) {
        setJoinRequests(prev =>
          prev.map(req => req.id === leaguePlayerId ? { ...req, approvalStatus: 'approved' } : req)
        );
        if (onRequestsUpdated) onRequestsUpdated();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRegenerateFixtures = async () => {
    try {
      setProcessingId('global_regenerate');
      const response = await apiClient.post(`/leagues/${leagueId}/fixtures/generate`, {
        mode: 'incremental'
      });
      if (response.data.success) {
        alert(response.data.message || 'Fixtures updated successfully');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update fixtures');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (leaguePlayerId) => {
    try {
      setProcessingId(leaguePlayerId);
      const response = await apiClient.post(
        `/leagues/${leagueId}/join-requests/${leaguePlayerId}/approve`,
        { action: 'reject' }
      );
      if (response.data.success) {
        setJoinRequests(prev =>
          prev.map(req => req.id === leaguePlayerId ? { ...req, approvalStatus: 'rejected' } : req)
        );
        if (onRequestsUpdated) onRequestsUpdated();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reject');
    } finally {
      setProcessingId(null);
    }
  };

  const statusConfig = {
    pending: { color: 'text-amber-500', bg: 'bg-amber-50', icon: FaHistory },
    approved: { color: 'text-green-500', bg: 'bg-green-50', icon: FaCheck },
    rejected: { color: 'text-red-500', bg: 'bg-red-50', icon: FaTimes },
  };

  const stats = {
    pending: joinRequests.filter(r => r.approvalStatus === 'pending').length,
    approved: joinRequests.filter(r => r.approvalStatus === 'approved').length,
    rejected: joinRequests.filter(r => r.approvalStatus === 'rejected').length,
    all: joinRequests.length
  };



  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#132F45]/30 backdrop-blur-md overflow-y-auto">
      <div className="bg-white rounded-[3.5rem] w-full max-w-3xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col animate-in fade-in zoom-in duration-500 max-h-[88vh]">
        {/* Header */}
        <div className="px-6 pt-8 pb-4 border-b border-gray-50 bg-gradient-to-b from-[#FAFAFA] to-white relative shrink-0 text-left">
          <div className="absolute top-0 right-0 p-10 opacity-5 z-0 pointer-events-none">
            <FaUserPlus className="text-8xl text-[#132F45]" />
          </div>
          <div className="flex items-center gap-3 mb-2">
            <span className="w-2 h-5 bg-[#BA995D] rounded-full" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-[#BA995D]">Join Requests</h2>
          </div>
          <div className="flex justify-between items-end">
            <h3 className="text-3xl font-black text-[#132F45] tracking-tight">Join <span className="text-[#BA995D]">Requests</span></h3>
            <button onClick={onClose} className="relative z-10 p-3 hover:bg-gray-50 rounded-2xl transition-colors text-gray-300 hover:text-[#132F45]">
              <FaTimes className="text-xl" />
            </button>
          </div>
          <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-2">{leagueName}</p>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-4 bg-[#FAFAFA] border-b border-gray-50 flex items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 mr-4 opacity-30">
              <FaFilter className="text-[9px]" />
              <span className="text-[8px] font-black uppercase tracking-widest">Filter By Status</span>
            </div>
            <div className="flex gap-2">
              {['pending', 'approved', 'rejected', 'all'].map(s => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 ${filter === s ? 'bg-[#132F45] text-white shadow-lg scale-105' : 'bg-white text-gray-400 hover:bg-gray-100 border border-gray-50'}`}
                >
                  {s}
                  <span className={`px-2 py-0.5 rounded-full text-[8px] ${filter === s ? 'bg-[#BA995D] text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {stats[s] || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleRegenerateFixtures}
            disabled={processingId === 'global_regenerate'}
            className="px-4 py-2 bg-[#BA995D] text-white text-[8px] font-black uppercase tracking-widest rounded-xl hover:bg-[#132F45] transition-all flex items-center gap-2 shadow-md shadow-[#BA995D]/20 disabled:opacity-50"
          >
            {processingId === 'global_regenerate' ? (
              <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <FaProjectDiagram className="text-[10px]" />
            )}
            Regenerate Fixtures
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar shrink flex-grow text-left">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-[#BA995D]/20 border-t-[#BA995D] rounded-full animate-spin" />
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#132F45]/40 animate-pulse">Loading requests...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border-2 border-red-100 rounded-[2rem] flex flex-col items-center gap-3 text-center">
              <FaTimes className="text-xl text-red-400" />
              <p className="text-[9px] font-black uppercase tracking-widest text-red-700">{error}</p>
            </div>
          ) : joinRequests.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-4 opacity-20">
              <FaUsers className="text-5xl text-[#132F45]" />
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#132F45]">No join requests found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {joinRequests.map(request => {
                const cfg = statusConfig[request.approvalStatus] || statusConfig.pending;
                const StatusIcon = cfg.icon;

                return (
                  <div
                    key={request.id}
                    className={`group relative bg-[#FAFAFA] hover:bg-white border-2 transition-all duration-500 rounded-[2rem] p-6 overflow-hidden border-transparent hover:border-gray-50`}
                  >
                    {/* Player Info Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-2xl ${cfg.bg} flex items-center justify-center`}>
                          <StatusIcon className={`text-base ${cfg.color}`} />
                        </div>
                        <div>
                          <h4 className="text-lg font-black text-[#132F45] tracking-tight group-hover:text-[#BA995D] transition-colors">
                            {request.playerName || request.player?.name || 'Unknown Player'}
                          </h4>
                          <div className="flex items-center gap-3 text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                            <span className="flex items-center gap-1.5"><FaEnvelope className="text-[#BA995D]" /> {request.playerEmail || 'N/A'}</span>
                            <span className="flex items-center gap-1.5"><FaCalendarAlt className="text-[#BA995D]" /> {new Date(request.enrollmentDate || request.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-3 relative z-10">
                        {request.approvalStatus === 'pending' && (
                          <div className="flex items-center gap-3 animate-in slide-in-from-right-4 duration-500">
                            <button
                              onClick={() => handleReject(request.id)}
                              disabled={processingId === request.id}
                              className="w-12 h-12 rounded-2xl bg-white border border-gray-100 text-red-400 hover:bg-red-50 hover:border-red-100 flex items-center justify-center transition-all disabled:opacity-50"
                            >
                              <FaTimes />
                            </button>
                            <button
                              onClick={() => handleApproveClick(request.id)}
                              disabled={processingId === request.id}
                              className="px-8 h-12 rounded-2xl bg-[#132F45] text-white text-[9px] font-black uppercase tracking-widest hover:bg-[#BA995D] transition-all disabled:opacity-50 flex items-center gap-3"
                            >
                              {processingId === request.id
                                ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                : <>Approve <FaArrowRight /></>
                              }
                            </button>
                          </div>
                        )}

                        {request.approvalStatus !== 'pending' && (
                          <div className={`flex items-center gap-2 px-6 py-3 rounded-2xl ${cfg.bg} ${cfg.color} text-[9px] font-black uppercase tracking-widest animate-in zoom-in duration-500`}>
                            <StatusIcon className="text-xs" />
                            {request.approvalStatus}
                          </div>
                        )}
                      </div>
                    </div>



                    <div className="absolute top-0 right-0 p-8 text-6xl text-[#132F45] opacity-[0.02] -rotate-12 group-hover:rotate-0 transition-transform duration-1000">
                      <FaUserPlus />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-12 py-8 bg-[#FAFAFA] border-t border-gray-100 flex items-center justify-between shrink-0 text-left">
          <button
            onClick={onClose}
            className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-300 hover:text-red-500 transition-colors"
          >
            Back
          </button>
          <div className="flex items-center gap-2 text-gray-200">
            <FaHistory className="text-xs" />
            <span className="text-[9px] font-black uppercase tracking-widest italic">Temporal Audit active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinRequestsModal;
