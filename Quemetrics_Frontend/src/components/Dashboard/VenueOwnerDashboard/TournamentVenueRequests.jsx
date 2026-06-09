import React, { useEffect, useState } from "react";
import apiClient from "../../../contexts/apiClient";
import { FaCheck, FaTimes, FaCalendarAlt, FaInfoCircle } from "react-icons/fa";
import Loader from "../../ui/Loader";

const TournamentVenueRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get("/venue-owner/tournament-venue-requests");
      if (response.data?.success) {
        setRequests(response.data.data || []);
      } else {
        setRequests([]);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to fetch venue requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const hasValidTournament = (r) => !!(r.tournament && r.tournament.id);
  const pendingRequests = requests.filter(
    (r) => r.status === "pending" && hasValidTournament(r)
  );
  const pastRequests = requests.filter(
    (r) => r.status !== "pending" && hasValidTournament(r)
  );

  const handleAction = async (requestId, action) => {
    const endpoint =
      action === "accept"
        ? `/venue-owner/tournament-venue-requests/${requestId}/accept`
        : `/venue-owner/tournament-venue-requests/${requestId}/reject`;

    try {
      setActionLoading(requestId);
      const response = await apiClient.put(endpoint, { action });
      if (response.data?.success) {
        const nextStatus = action === "accept" ? "accepted" : "rejected";
        setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: nextStatus } : r)));
      }
    } catch (err) {
      alert(err.response?.data?.error || `Failed to ${action} request`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <Loader text="Fetching Tournament Requests..." />;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />

        <div className="max-w-5xl w-full mx-auto relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-10">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center justify-center xl:justify-start gap-3 text-center xl:text-left">
              <span className="w-6 h-[1px] bg-[#BA995D]" /> Requests
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2 text-center xl:text-left">
              Tournament Requests
            </h1>
            <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] max-w-md leading-relaxed text-center xl:text-left mx-auto xl:mx-0">
              Review venue requests from organizations for tournament hosting.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl min-w-[240px]">
            <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <span className="text-lg font-black tracking-tighter text-white">{pendingRequests.length}</span>
              <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Pending Action</span>
            </div>
            <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
              <button onClick={fetchRequests} className="text-[10px] text-[#BA995D] hover:text-white transition-colors">
                <span className="text-lg font-black tracking-tighter block leading-none">SYNC</span>
                <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Update Feed</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 md:py-16 flex flex-col gap-12 relative z-20 -mt-8">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest mb-6">
            {error}
          </div>
        )}

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
              <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest mt-1">No pending tournament requests to review.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingRequests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  actionLoading={actionLoading === request.id}
                  onApprove={() => handleAction(request.id, "accept")}
                  onReject={() => handleAction(request.id, "reject")}
                />
              ))}
            </div>
          )}
        </section>

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
                      <th className="px-6 py-4 text-[7px] font-black text-gray-400 uppercase tracking-widest">Tournament</th>
                      <th className="px-6 py-4 text-[7px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {pastRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-gray-50/40 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-[10px] font-bold text-gray-500">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-[10px] font-black text-[#132F45] uppercase tracking-tight">
                          {request.requestingOrganization?.organizationName || request.requestingOrganization?.name || "Unknown"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-[10px] font-bold text-gray-500">
                          {request.tournament?.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest shadow-sm ring-1 ring-inset ${
                              request.status === "accepted"
                                ? "bg-[#EBF5EE] text-[#2D6A4F] ring-[#B7E4C7]"
                                : "bg-red-50 text-red-700 ring-red-100"
                            }`}
                          >
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </span>
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

const RequestCard = ({ request, onApprove, onReject, actionLoading }) => {
  const tournament = request.tournament || {};
  if (!tournament.id) return null;

  return (
    <div className="bg-white rounded-[1.5rem] border border-gray-50 shadow-xl shadow-[#132F45]/5 overflow-hidden group hover:shadow-2xl hover:shadow-[#132F45]/10 transition-all duration-500 p-6 flex flex-col h-full">
      <div className="flex-1">
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-black text-[14px] text-[#132F45] uppercase tracking-tight line-clamp-1" title={request.requestingOrganization?.organizationName}>
            {request.requestingOrganization?.organizationName || "Unknown organizer"}
          </h3>
          <span className="bg-[#FDF2D1] text-[#BA995D] text-[7px] font-black px-2.5 py-0.5 rounded border border-[#BA995D]/20 uppercase tracking-widest">
            New
          </span>
        </div>

        <div className="space-y-2 mt-4 text-[10px] text-gray-500 font-bold">
          <p className="flex items-center">
            <strong className="w-24 font-black text-gray-400 uppercase tracking-widest text-[7px]">Tournament:</strong>
            <span className="truncate" title={tournament.name}>
              {tournament.name}
            </span>
          </p>
          <p className="flex items-center">
            <strong className="w-24 font-black text-gray-400 uppercase tracking-widest text-[7px]">Club:</strong>
            <span className="truncate" title={tournament.club?.name}>
              {tournament.club?.name || "—"}
            </span>
          </p>
          <p className="flex items-center">
            <strong className="w-24 font-black text-gray-400 uppercase tracking-widest text-[7px]">Requested:</strong>
            <span>{new Date(request.createdAt).toLocaleDateString()}</span>
          </p>

          {request.venueOwner?.venueName && (
            <p className="flex items-center">
              <strong className="w-24 font-black text-gray-400 uppercase tracking-widest text-[7px]">Venue:</strong>
              <span className="truncate" title={request.venueOwner?.venueName}>
                {request.venueOwner.venueName}
              </span>
            </p>
          )}
        </div>

        {request.notes && (
          <div className="mt-4 bg-[#FAFAFA] p-3 rounded-xl text-[10px] text-gray-600 border border-gray-100">
            <div className="flex items-start">
              <FaInfoCircle className="text-gray-400 mt-0.5 mr-2 shrink-0" />
              <p className="leading-relaxed">{request.notes}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3 pt-4 border-t border-gray-100">
        <button
          onClick={onReject}
          disabled={actionLoading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50 text-[9px] font-black uppercase tracking-widest"
        >
          <FaTimes /> Reject
        </button>
        <button
          onClick={onApprove}
          disabled={actionLoading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#132F45] text-white rounded-xl hover:bg-[#1c4566] transition-colors disabled:opacity-50 text-[9px] font-black uppercase tracking-widest"
        >
          <FaCheck /> Approve
        </button>
      </div>
    </div>
  );
};

export default TournamentVenueRequests;

