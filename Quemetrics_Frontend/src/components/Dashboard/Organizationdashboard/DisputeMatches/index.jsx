import React, { useState, useEffect, useContext } from 'react';
import {
  FaCheckCircle, FaExclamationTriangle, FaShieldAlt, FaInfoCircle,
  FaUserCheck, FaGavel, FaCheck, FaTimes, FaImage, FaHistory, FaClock
} from 'react-icons/fa';
import Card from '../../../ui/Card';
import Button from '../../../ui/Button';
import Loader from '../../../ui/Loader';
import Modal from '../../../ui/Modal';
import { MatchResultContext } from '../../../../contexts/MatchResultContext';
import { useNotification } from '../../../../contexts/NotificationContext';
import { getImageUrl } from '../../../../utils/imageUtils';

const safeParseJSON = (data, fallback = []) => {
  if (!data) return fallback;
  if (typeof data === 'object') return data;
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error('Failed to parse JSON:', e);
    return fallback;
  }
};

export default function DisputedMatches() {
  const {
    getOrganizationGameTypes,
    getResultsAwaitingAdminApproval,
    getDisputesBySport,
    approveMatchResult,
    getDisputeDetails,
    resolveDispute
  } = useContext(MatchResultContext);
  const { showToast } = useNotification();
  const [activeTab, setActiveTab] = useState('approvals'); // 'approvals', 'disputes'
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [selectedItem, setSelectedItem] = useState(null); // For resolution modal

  const [selectedSport, setSelectedSport] = useState('snooker');
  const [availableSports, setAvailableSports] = useState([]);

  const fetchSports = async () => {
    try {
      const result = await getOrganizationGameTypes();
      if (result.success) {
        const sports = result.data || [];
        setAvailableSports(sports);
        if (sports.length > 0 && !sports.includes(selectedSport)) {
          setSelectedSport(sports[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch sports', error);
    }
  };

  useEffect(() => {
    fetchSports();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      let result;
      if (activeTab === 'approvals') {
        result = await getResultsAwaitingAdminApproval();
        if (result.success) {
          setItems(result.data || []);
        }
      } else {
        // Fetch all disputes for the organization filtered by sport
        result = await getDisputesBySport(selectedSport);
        if (result.success) {
          // Filter out disputes from leagues where disputes are disabled
          const filteredItems = (result.data || []).filter(dispute => {
            const disputing = dispute.league?.reporting?.dispute?.enabled !== false;
            return disputing;
          });
          setItems(filteredItems);
        }
      }
    } catch (error) {
      showToast('Failed to fetch data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, selectedSport]);

  const handleApprove = async (resultId) => {
    setActionLoading(resultId);
    try {
      const result = await approveMatchResult(resultId, adminNotes);
      if (result.success) {
        showToast('Result approved successfully!', 'success');
        setAdminNotes('');
        fetchData();

        // Dispatch event to refresh tournament match management if it's a tournament match
        const tournamentId = result.data?.tournamentId;
        if (tournamentId) {
          window.dispatchEvent(new CustomEvent('disputeResolved', { detail: { tournamentId } }));
        }
      } else {
        showToast(result.error || 'Failed to approve result', 'error');
      }
    } catch (error) {
      showToast(error.message || 'Failed to approve result', 'error');
    } finally {
      setActionLoading(null);
    }
  };


  const handleResolve = async (disputeId, resolutionData) => {
    setActionLoading(disputeId);
    try {
      const result = await resolveDispute(disputeId, resolutionData);
      if (result.success) {
        showToast('Dispute resolved successfully!', 'success');
        setSelectedItem(null);
        setAdminNotes('');
        fetchData();

        // Dispatch event to refresh tournament match management if it's open
        window.dispatchEvent(new CustomEvent('disputeResolved', { detail: { tournamentId: result.data?.tournamentId } }));
      } else {
        showToast(result.error || 'Failed to resolve dispute', 'error');
      }
    } catch (error) {
      showToast(error.message || 'Failed to resolve dispute', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const openResolveModal = async (disputeId) => {
    setLoading(true);
    try {
      const result = await getDisputeDetails(disputeId);
      if (result.success) {
        setSelectedItem(result.data);
      } else {
        showToast(result.error || 'Failed to load dispute details', 'error');
      }
    } catch (error) {
      showToast(error.message || 'Failed to load dispute details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderApprovalCard = (result) => (
    <Card key={result.id} className="bg-white border-2 border-gray-100 shadow-sm hover:shadow-md transition-all h-full">
      <div className="p-6 flex flex-col h-full">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <div className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">
              {result.matchType} • {result.sport}
            </div>
            <div className="text-xl font-black text-gray-900 leading-tight">
              {result.league?.name || result.tournament?.name}
            </div>
          </div>
          {result.isWalkover ? (
            <span className="px-3 py-1 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border border-orange-100">
              <FaInfoCircle className="animate-pulse" /> Walkover
            </span>
          ) : (
            <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border border-blue-100">
              <FaClock className="animate-pulse" /> Awaiting Approval
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 py-6 px-8 bg-gray-50 rounded-2xl mb-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-5 italic text-[10px] uppercase font-black tracking-tighter">Preview</div>
          {result.winnerId && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-emerald-500 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-md z-10">
              Winner: {String(result.winnerId) === String(result.player1?.id) ? (result.player1?.name || result.player1?.nickname) : (result.player2?.name || result.player2?.nickname)}
            </div>
          )}
          <div className="text-center flex-1 mt-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">{result.player1?.name || result.player1?.nickname || 'Player 1'}</div>
            <div className="text-3xl font-black text-gray-900">{result.player1Frames || result.player1RackWins || 0}</div>
          </div>
          <div className="px-3 py-1 bg-white rounded-lg shadow-sm border border-gray-100 text-[10px] font-black text-gray-400">VS</div>
          <div className="text-center flex-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">{result.player2?.name || result.player2?.nickname || 'Player 2'}</div>
            <div className="text-3xl font-black text-gray-900">{result.player2Frames || result.player2RackWins || 0}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-3 bg-white border border-gray-100 rounded-xl">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Submitted</div>
            <div className="text-xs font-bold text-gray-700">{result.submitter?.name}</div>
          </div>
          <div className="p-3 bg-white border border-gray-100 rounded-xl">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Confirmed</div>
            <div className="text-xs font-bold text-gray-700">{result.confirmedByPlayer?.name || 'By Opponent'}</div>
          </div>
        </div>

        {result.imageUrl && (
          <div className="mb-6">
            <button
              onClick={() => window.open(getImageUrl(result.imageUrl), '_blank')}
              className="w-full h-32 relative rounded-xl overflow-hidden group border-2 border-gray-100"
            >
              <img src={getImageUrl(result.imageUrl)} alt="Proof" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-lg text-white text-[10px] font-black uppercase tracking-widest border border-white/30">View Evidence</span>
              </div>
            </button>
          </div>
        )}

        {/* Frame-by-Frame Details */}
        {result.pookerFrameDetails && (
          <div className="mb-6">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Frame Details</div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {safeParseJSON(result.pookerFrameDetails).map((frame, idx) => {
                const p1Score = parseInt(frame.player1Score) || 0;
                const p2Score = parseInt(frame.player2Score) || 0;
                const p1Wins = String(frame.winnerId) === String(result.player1?.id) || (!frame.winnerId && p1Score > p2Score);
                const p2Wins = String(frame.winnerId) === String(result.player2?.id) || (!frame.winnerId && p2Score > p1Score);
                const frameWinner = p1Wins ? result.player1 : (p2Wins ? result.player2 : null);
                return (
                  <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 text-xs">
                    <span className="font-bold text-gray-500">Frame {frame.frameNumber || idx + 1}</span>
                    <div className="flex items-center gap-2">
                      <span className={p1Wins ? 'font-black text-gray-900' : 'text-gray-400'}>
                        {result.player1?.name?.split(' ')[0]}: {p1Score}
                      </span>
                      <span className="text-gray-300">vs</span>
                      <span className={p2Wins ? 'font-black text-gray-900' : 'text-gray-400'}>
                        {result.player2?.name?.split(' ')[0]}: {p2Score}
                      </span>
                      {frameWinner && (
                        <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px] font-bold">
                          W: {frameWinner.name?.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {result.snookerFrameDetails && (
          <div className="mb-6">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Frame Details</div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {safeParseJSON(result.snookerFrameDetails).map((frame, idx) => {
                const p1Score = parseInt(frame.player1Score) || 0;
                const p2Score = parseInt(frame.player2Score) || 0;
                const p1Wins = String(frame.winnerId) === String(result.player1?.id) || (!frame.winnerId && p1Score > p2Score);
                const p2Wins = String(frame.winnerId) === String(result.player2?.id) || (!frame.winnerId && p2Score > p1Score);
                const frameWinner = p1Wins ? result.player1 : (p2Wins ? result.player2 : null);
                return (
                  <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 text-xs">
                    <span className="font-bold text-gray-500">Frame {frame.frameNumber || idx + 1}</span>
                    <div className="flex items-center gap-2">
                      <span className={p1Wins ? 'font-black text-gray-900' : 'text-gray-400'}>
                        {result.player1?.name?.split(' ')[0]}: {p1Score}
                      </span>
                      <span className="text-gray-300">vs</span>
                      <span className={p2Wins ? 'font-black text-gray-900' : 'text-gray-400'}>
                        {result.player2?.name?.split(' ')[0]}: {p2Score}
                      </span>
                      {frameWinner && (
                        <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px] font-bold">
                          W: {frameWinner.name?.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {result.poolRackDetails && (
          <div className="mb-6">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Rack Details</div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {safeParseJSON(result.poolRackDetails).map((rack, idx) => {
                const p1Score = parseInt(rack.player1Score) || 0;
                const p2Score = parseInt(rack.player2Score) || 0;
                const p1Wins = String(rack.winnerId) === String(result.player1?.id) || (!rack.winnerId && p1Score > p2Score);
                const p2Wins = String(rack.winnerId) === String(result.player2?.id) || (!rack.winnerId && p2Score > p1Score);
                const rackWinner = p1Wins ? result.player1 : (p2Wins ? result.player2 : null);
                return (
                  <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 text-xs">
                    <span className="font-bold text-gray-500">Rack {rack.rackNumber || idx + 1}</span>
                    <div className="flex items-center gap-2">
                      <span className={p1Wins ? 'font-black text-gray-900' : 'text-gray-400'}>
                        {result.player1?.name?.split(' ')[0]}: {p1Score}
                      </span>
                      <span className="text-gray-300">vs</span>
                      <span className={p2Wins ? 'font-black text-gray-900' : 'text-gray-400'}>
                        {result.player2?.name?.split(' ')[0]}: {p2Score}
                      </span>
                      {rackWinner && (
                        <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px] font-bold">
                          W: {rackWinner.name?.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-auto space-y-4">
          <div className="relative">
            <textarea
              placeholder="Admin review notes..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full border-2 border-gray-100 rounded-xl p-4 text-sm focus:border-blue-500 focus:outline-none transition-all placeholder:text-gray-300 min-h-[80px]"
            />
          </div>
          <Button
            onClick={() => handleApprove(result.id)}
            variant="primary"
            className="w-full h-14 bg-gray-900 hover:bg-black text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-gray-200"
            loading={actionLoading === result.id}
          >
            <FaCheck /> Confirm Official Result
          </Button>
        </div>
      </div>
    </Card>
  );

  const renderDisputeCard = (dispute) => (
    <Card key={dispute.id} className="bg-white border-2 border-red-50 shadow-sm hover:shadow-md transition-all h-full relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-red-50 rounded-full blur-2xl opacity-50" />
      <div className="p-6 flex flex-col h-full relative">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <div className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">
              DISPUTED MATCH • {dispute.sport}
            </div>
            <div className="text-xl font-black text-gray-900 leading-tight">
              {dispute.league?.name || dispute.tournament?.name || 'Standard Match'}
            </div>
          </div>
          <span className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border border-red-100">
            <FaExclamationTriangle className="animate-bounce" /> Action Required
          </span>
        </div>

        <div className="mb-6 p-5 bg-red-50/50 rounded-2xl border border-red-50 relative">
          <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-red-600 text-[10px] font-black text-white rounded-md uppercase tracking-widest leading-none flex items-center">
            Issue Reported
          </div>
          <p className="text-sm font-medium text-red-900 leading-relaxed pt-2">
            "{dispute.disputeReason || 'Result does not match actual outcome'}"
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 py-4 px-6 bg-gray-50 rounded-2xl mb-6">
          <div className="text-center flex-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Player 1</div>
            <div className="text-sm font-black text-gray-900">{dispute.opponent?.name || dispute.opponent?.nickname || 'Player 1'}</div>
          </div>
          <div className="px-3 py-1 bg-white rounded-lg shadow-sm border border-gray-100 text-[10px] font-black text-gray-400">VS</div>
          <div className="text-center flex-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Player 2</div>
            <div className="text-sm font-black text-gray-900">{dispute.submitter?.name || dispute.submitter?.nickname || 'Player 2'}</div>
          </div>
        </div>



        <div className="mt-auto space-y-3 pt-4 border-t border-gray-100">
          <Button
            onClick={() => openResolveModal(dispute.id)}
            variant="primary"
            className="w-full h-12 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <FaGavel /> View Details & Resolve
          </Button>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <FaShieldAlt className="text-blue-600" /> Match Management
          </h1>
          <p className="text-gray-500 font-medium text-lg">Review submissions, approve results and resolve player disputes</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          {activeTab === 'disputes' && availableSports.length > 0 && (
            <div className="flex bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200">
              {availableSports.map((sport) => (
                <button
                  key={sport}
                  onClick={() => setSelectedSport(sport)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedSport === sport ? 'bg-white text-red-600 shadow-md' : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                  {sport}
                </button>
              ))}
            </div>
          )}
          <div className="flex bg-gray-100 p-1.5 rounded-2xl shadow-inner">
            <button
              onClick={() => setActiveTab('approvals')}
              className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${activeTab === 'approvals' ? 'bg-white text-blue-600 shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <FaCheckCircle /> Pending Approvals
            </button>
            <button
              onClick={() => setActiveTab('disputes')}
              className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${activeTab === 'disputes' ? 'bg-white text-red-600 shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <FaExclamationTriangle /> Disputed Matches
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <Loader />
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {activeTab === 'approvals'
            ? items.map(renderApprovalCard)
            : items.map(renderDisputeCard)
          }
        </div>
      ) : (
        <Card className="p-20 text-center bg-gray-50 border-dashed border-4 border-gray-200 rounded-3xl">
          <div className="text-gray-300 mb-6 flex justify-center">
            {activeTab === 'approvals' ? <FaCheckCircle className="text-8xl" /> : <FaHistory className="text-8xl" />}
          </div>
          <h3 className="text-2xl font-black text-gray-700 mb-2">
            {activeTab === 'approvals' ? 'All Clear!' : 'No Active Disputes'}
          </h3>
          <p className="text-gray-500 text-lg max-w-md mx-auto">
            {activeTab === 'approvals'
              ? "There are no match results currently awaiting your approval. You're completely up to date!"
              : `Great news! There are no disputed ${selectedSport} matches that require intervention at this time.`}
          </p>
        </Card>
      )}

      {/* Resolution Modal */}
      <ResolveModal
        dispute={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onResolve={handleResolve}
        loading={!!actionLoading}
      />
    </div>
  );
}

function ResolveModal({ dispute, isOpen, onClose, onResolve, loading }) {
  const [resolutionData, setResolutionData] = useState({
    finalWinnerId: '',
    finalPlayer1Frames: 0,
    finalPlayer2Frames: 0,
    finalPlayer1RackWins: 0,
    finalPlayer2RackWins: 0,
    finalSnookerFrameDetails: [],
    finalPookerFrameDetails: [],
    finalPoolRackDetails: [],
    resolutionNotes: ''
  });

  const sport = dispute?.sport || dispute?.league?.sport || dispute?.matchResult?.sport || '';
  const isSnooker = sport === 'snooker';
  const isPooker = sport === 'pooker';
  const isPool = sport === 'pool';

  const p1Id = dispute?.player1Id || dispute?.matchResult?.player1Id;
  const submitterIsP1 = !dispute?.submitterId || String(dispute.submitterId) === String(p1Id);

  const matchRules = dispute?.league?.matchRules || dispute?.matchResult?.league?.matchRules || dispute?.matchResult?.booking?.league?.matchRules;
  let parsedRules = {};
  if (typeof matchRules === 'string') {
    try { parsedRules = JSON.parse(matchRules); } catch (e) { }
  } else if (matchRules) {
    parsedRules = matchRules;
  }
  const isOverallPointsEnabled = !matchRules || parsedRules.scoreDetail === 'points';

  useEffect(() => {
    if (dispute) {
      const p1Frames = dispute.player1Frames ?? dispute.matchResult?.player1Frames ?? 0;
      const p2Frames = dispute.player2Frames ?? dispute.matchResult?.player2Frames ?? 0;
      const p1Racks = dispute.player1RackWins ?? dispute.matchResult?.player1RackWins ?? 0;
      const p2Racks = dispute.player2RackWins ?? dispute.matchResult?.player2RackWins ?? 0;

      const p1ClaimFrames = dispute.claimedPlayer1Frames ?? 0;
      const p2ClaimFrames = dispute.claimedPlayer2Frames ?? 0;
      const p1ClaimRacks = dispute.claimedPlayer1RackWins ?? 0;
      const p2ClaimRacks = dispute.claimedPlayer2RackWins ?? 0;

      const subDetails = safeParseJSON(isSnooker ? (dispute.snookerFrameDetails || dispute.matchResult?.snookerFrameDetails) :
        isPooker ? (dispute.pookerFrameDetails || dispute.matchResult?.pookerFrameDetails) :
          (dispute.poolRackDetails || dispute.matchResult?.poolRackDetails));

      const claimDetails = safeParseJSON(isSnooker ? dispute.claimedSnookerFrameDetails :
        isPooker ? dispute.claimedPookerFrameDetails :
          dispute.claimedPoolRackDetails);

      // INITIAL CALCULATION: Derive totals from subDetails to ensure we don't start at 0-0 if top fields are null
      let initialP1Total = p1Frames || p1Racks || 0;
      let initialP2Total = p2Frames || p2Racks || 0;

      if (Array.isArray(subDetails) && subDetails.length > 0) {
        let p1Count = 0;
        let p2Count = 0;
        const p1Id = dispute.player1Id || dispute.matchResult?.player1Id;
        const p2Id = dispute.player2Id || dispute.matchResult?.player2Id;

        subDetails.forEach(f => {
          const s1 = parseInt(f.player1Score) || 0;
          const s2 = parseInt(f.player2Score) || 0;
          if (String(f.winnerId) === String(p1Id) || s1 > s2) p1Count++;
          else if (String(f.winnerId) === String(p2Id) || s2 > s1) p2Count++;
        });

        // If we found actual frames, use those as the initial official resolution
        if (p1Count > 0 || p2Count > 0) {
          initialP1Total = p1Count;
          initialP2Total = p2Count;
        }
      }

      // Calculate claimed totals from details if available
      let claimedP1Total = (isSnooker || isPooker) ? p1ClaimFrames : p1ClaimRacks;
      let claimedP2Total = (isSnooker || isPooker) ? p2ClaimFrames : p2ClaimRacks;

      if (Array.isArray(claimDetails) && claimDetails.length > 0) {
        let p1Count = 0;
        let p2Count = 0;
        const p1Id = dispute.player1Id || dispute.matchResult?.player1Id;
        const p2Id = dispute.player2Id || dispute.matchResult?.player2Id;

        claimDetails.forEach(f => {
          const s1 = parseInt(f.player1Score) || 0;
          const s2 = parseInt(f.player2Score) || 0;
          if (String(f.winnerId) === String(p1Id) || s1 > s2) p1Count++;
          else if (String(f.winnerId) === String(p2Id) || s2 > s1) p2Count++;
        });

        // Use calculated counts from claimed details if available
        if (p1Count > 0 || p2Count > 0) {
          claimedP1Total = p1Count;
          claimedP2Total = p2Count;
        }
      }

      setResolutionData({
        finalWinnerId: dispute.finalWinnerId || dispute.matchResult?.winnerId || '',

        // Final values for resolution (default to claimed values when available, otherwise submitted)
        finalPlayer1Frames: dispute.finalPlayer1Frames || claimedP1Total || initialP1Total,
        finalPlayer2Frames: dispute.finalPlayer2Frames || claimedP2Total || initialP2Total,
        finalPlayer1RackWins: dispute.finalPlayer1RackWins || claimedP1Total || initialP1Total,
        finalPlayer2RackWins: dispute.finalPlayer2RackWins || claimedP2Total || initialP2Total,

        // Store initial derived totals for display as well
        initialP1Total,
        initialP2Total,

        finalSnookerFrameDetails: safeParseJSON(dispute.finalSnookerFrameDetails || (isSnooker ? subDetails : [])),
        finalPookerFrameDetails: safeParseJSON(dispute.finalPookerFrameDetails || (isPooker ? subDetails : [])),
        finalPoolRackDetails: safeParseJSON(dispute.finalPoolRackDetails || (isPool ? subDetails : [])),

        resolutionNotes: dispute.resolutionNotes || ''
      });
    }
  }, [dispute]);

  if (!dispute) return null;

  const handleScoreChange = (field, value) => {
    const intValue = parseInt(value) || 0;
    const updateObj = { [field]: intValue };

    // For Poker: sync frames and rackWins when either changes
    if (isPooker) {
      if (field === 'finalPlayer1Frames' || field === 'finalPlayer1RackWins') {
        updateObj.finalPlayer1RackWins = intValue;
        updateObj.finalPlayer1Frames = intValue;
      } else if (field === 'finalPlayer2Frames' || field === 'finalPlayer2RackWins') {
        updateObj.finalPlayer2RackWins = intValue;
        updateObj.finalPlayer2Frames = intValue;
      }
    }

    setResolutionData(prev => ({
      ...prev,
      ...updateObj
    }));
  };

  const handleFrameDetailChange = (index, field, value, isCheckbox = false) => {
    const resKey = isSnooker ? 'finalSnookerFrameDetails' : isPooker ? 'finalPookerFrameDetails' : 'finalPoolRackDetails';
    setResolutionData(prev => {
      const newList = Array.isArray(prev[resKey]) ? [...prev[resKey]] : [];
      while (newList.length <= index) {
        newList.push({ frameNumber: newList.length + 1, player1Score: 0, player2Score: 0 });
      }
      newList[index] = { ...newList[index], [field]: isCheckbox ? value : (parseInt(value) || 0) };

      const p1Id = dispute.player1Id || dispute.matchResult?.player1Id;
      const p2Id = dispute.player2Id || dispute.matchResult?.player2Id;

      const p1Score = parseInt(newList[index].player1Score) || 0;
      const p2Score = parseInt(newList[index].player2Score) || 0;
      if (p1Score > p2Score) newList[index].winnerId = p1Id;
      else if (p2Score > p1Score) newList[index].winnerId = p2Id;
      else newList[index].winnerId = null;

      // Recalculate totals automatically based on all frames
      let p1Total = 0;
      let p2Total = 0;
      newList.forEach(frame => {
        const fp1 = parseInt(frame.player1Score) || 0;
        const fp2 = parseInt(frame.player2Score) || 0;
        if (String(frame.winnerId) === String(p1Id) || fp1 > fp2) p1Total++;
        else if (String(frame.winnerId) === String(p2Id) || fp2 > fp1) p2Total++;
      });

      let newWinnerId = prev.finalWinnerId;
      if (p1Total > p2Total) newWinnerId = p1Id;
      else if (p2Total > p1Total) newWinnerId = p2Id;

      // For Poker: update BOTH frames AND rackWins fields (since display uses rackWins)
      // For Snooker: update frames only
      // For Pool: update rackWins only
      const updateObj = {
        [resKey]: newList,
        finalWinnerId: newWinnerId
      };

      if (isPooker) {
        // For Poker, update both frames and rackWins
        updateObj.finalPlayer1Frames = p1Total;
        updateObj.finalPlayer2Frames = p2Total;
        updateObj.finalPlayer1RackWins = p1Total;
        updateObj.finalPlayer2RackWins = p2Total;
      } else if (isSnooker) {
        updateObj.finalPlayer1Frames = p1Total;
        updateObj.finalPlayer2Frames = p2Total;
      } else if (isPool) {
        updateObj.finalPlayer1RackWins = p1Total;
        updateObj.finalPlayer2RackWins = p2Total;
      }

      return {
        ...prev,
        ...updateObj
      };
    });
  };

  const footer = (
    <div className="flex justify-end gap-3 w-full">
      <Button variant="secondary" onClick={onClose} disabled={loading} className="px-8 h-12 rounded-xl font-bold">
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={() => onResolve(dispute.id, resolutionData)}
        loading={loading}
        className="px-10 h-12 bg-red-600 hover:bg-black text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-red-100"
      >
        Confirm Official Decision
      </Button>
    </div>
  );


  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Administrative Dispute Review" footer={footer} size="lg">
      <div className="space-y-8 py-2">
        <div className="bg-red-50/50 p-5 rounded-2xl border border-red-100/50">
          <div className="flex items-center gap-2 mb-2">
            <FaExclamationTriangle className="text-red-500" />
            <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Player Reported Issue</span>
          </div>
          <p className="text-sm font-medium text-red-900 italic leading-relaxed">
            "{dispute.disputeReason}"
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Submitted Section */}
          <div className="p-4 bg-gradient-to-br from-blue-50/50 to-white rounded-2xl border border-blue-100 flex flex-col items-center shadow-sm">
            <div className="text-[10px] font-black text-blue-500 uppercase mb-2 tracking-widest">Submitted Version</div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter mb-0.5">{dispute.matchResult?.player1?.name || dispute.matchResult?.player1?.nickname || 'P1'}</div>
                <div className="text-2xl font-black text-gray-900">{resolutionData.initialP1Total || 0}</div>
              </div>
              <div className="text-gray-300 font-black text-lg">:</div>
              <div className="text-center">
                <div className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter mb-0.5">{dispute.matchResult?.player2?.name || dispute.matchResult?.player2?.nickname || 'P2'}</div>
                <div className="text-2xl font-black text-gray-900">{resolutionData.initialP2Total || 0}</div>
              </div>
            </div>
          </div>

          {/* Claimed Section */}
          <div className="p-4 bg-gradient-to-br from-red-50/50 to-white rounded-2xl border border-red-100 flex flex-col items-center shadow-sm">
            <div className="text-[10px] font-black text-red-500 uppercase mb-2 tracking-widest">Opponent's Claim</div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter mb-0.5">{dispute.matchResult?.player1?.name || dispute.matchResult?.player1?.nickname || 'P1'}</div>
                <div className="text-2xl font-black text-gray-900">{(() => {
                  const claimDetails = safeParseJSON(isSnooker ? dispute.claimedSnookerFrameDetails : isPooker ? dispute.claimedPookerFrameDetails : dispute.claimedPoolRackDetails);
                  if (Array.isArray(claimDetails) && claimDetails.length > 0) {
                    let p1Count = 0;
                    const p1Id = dispute.matchResult?.player1Id;
                    const p2Id = dispute.matchResult?.player2Id;
                    claimDetails.forEach(f => {
                      const s1 = parseInt(f.player1Score) || 0;
                      const s2 = parseInt(f.player2Score) || 0;
                      if (String(f.winnerId) === String(p1Id) || s1 > s2) p1Count++;
                    });
                    return p1Count || (isSnooker || isPooker ? dispute.claimedPlayer1Frames : dispute.claimedPlayer1RackWins) || 0;
                  }
                  return (isSnooker || isPooker ? dispute.claimedPlayer1Frames : dispute.claimedPlayer1RackWins) || 0;
                })()}</div>
              </div>
              <div className="text-gray-300 font-black text-lg">:</div>
              <div className="text-center">
                <div className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter mb-0.5">{dispute.matchResult?.player2?.name || dispute.matchResult?.player2?.nickname || 'P2'}</div>
                <div className="text-2xl font-black text-gray-900">{(() => {
                  const claimDetails = safeParseJSON(isSnooker ? dispute.claimedSnookerFrameDetails : isPooker ? dispute.claimedPookerFrameDetails : dispute.claimedPoolRackDetails);
                  if (Array.isArray(claimDetails) && claimDetails.length > 0) {
                    let p2Count = 0;
                    const p1Id = dispute.matchResult?.player1Id;
                    const p2Id = dispute.matchResult?.player2Id;
                    claimDetails.forEach(f => {
                      const s1 = parseInt(f.player1Score) || 0;
                      const s2 = parseInt(f.player2Score) || 0;
                      if (String(f.winnerId) === String(p2Id) || s2 > s1) p2Count++;
                    });
                    return p2Count || (isSnooker || isPooker ? dispute.claimedPlayer2Frames : dispute.claimedPlayer2RackWins) || 0;
                  }
                  return (isSnooker || isPooker ? dispute.claimedPlayer2Frames : dispute.claimedPlayer2RackWins) || 0;
                })()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Comparison Tables */}
        <div className="space-y-6">
          {(() => {
            // Submitter Version (Original)
            const subFrames = safeParseJSON(isSnooker ? (dispute.snookerFrameDetails || dispute.matchResult?.snookerFrameDetails) :
              isPooker ? (dispute.pookerFrameDetails || dispute.matchResult?.pookerFrameDetails) :
                (dispute.poolRackDetails || dispute.matchResult?.poolRackDetails));

            // Opponent/Claimant Version (New fields)
            const claimFrames = safeParseJSON(isSnooker ? dispute.claimedSnookerFrameDetails :
              isPooker ? dispute.claimedPookerFrameDetails :
                dispute.claimedPoolRackDetails);

            const maxRows = Math.max(subFrames.length, claimFrames.length, 1);
            const rows = Array.from({ length: maxRows }, (_, i) => i);

            return (
              <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gray-900 text-white px-5 py-4 flex justify-between items-center">
                  <h3 className="text-xs font-black uppercase tracking-widest">{isPool ? 'Rack' : 'Frame'} Breakdown Comparison</h3>
                  <div className="flex gap-4 text-[10px]">
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400"></div> Submitter</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400"></div> Opponent</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        <th className="px-5 py-3 border-r">#</th>
                        <th className="px-5 py-3 text-center border-r bg-blue-50/30">Submitter ({dispute.submitter?.name || dispute.submitter?.nickname || 'P1'})</th>
                        <th className="px-5 py-3 text-center border-r bg-red-50/30">Opponent ({dispute.opponent?.name || dispute.opponent?.nickname || 'P2'})</th>
                        <th className="px-5 py-3 text-center bg-green-50/30 text-green-700 font-black">Official Resolution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map(idx => {
                        const sub = subFrames[idx] || {};
                        const clm = claimFrames[idx] || {};
                        const resKey = isSnooker ? 'finalSnookerFrameDetails' : isPooker ? 'finalPookerFrameDetails' : 'finalPoolRackDetails';
                        const res = resolutionData[resKey]?.[idx] || {};

                        return (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3 text-xs font-bold text-gray-400 border-r">{idx + 1}</td>

                            {/* Submitter Version */}
                            <td className="px-5 py-3 text-center border-r bg-blue-50/10">
                              <div className="flex items-center justify-center gap-2 text-sm font-black">
                                <span className={((String(sub.winnerId) === String(dispute.matchResult?.player1Id)) || (parseInt(sub.player1Score) > parseInt(sub.player2Score))) ? 'text-blue-600' : 'text-gray-400'}>
                                  {sub.player1Score ?? '-'}
                                </span>
                                <span className="text-gray-200">/</span>
                                <span className={((String(sub.winnerId) === String(dispute.matchResult?.player2Id)) || (parseInt(sub.player2Score) > parseInt(sub.player1Score))) ? 'text-red-600' : 'text-gray-400'}>
                                  {sub.player2Score ?? '-'}
                                </span>
                              </div>
                              {(isSnooker || isPooker) && (sub.player1Break !== undefined || sub.player2Break !== undefined) && (
                                <div className="text-[9px] text-gray-400 font-bold mb-1">Brk: {sub.player1Break || 0} / {sub.player2Break || 0}</div>
                              )}
                              {/* Balls Potted */}
                              {(isPool || isPooker) && (sub.player1BallsPotted !== undefined || sub.player2BallsPotted !== undefined) && (
                                <div className="text-[9px] text-gray-500 bg-gray-100/50 rounded px-1.5 py-0.5 mt-1 inline-block">
                                  <span className="text-blue-500 font-bold">{sub.player1BallsPotted || 0}</span>
                                  <span className="mx-1 text-gray-300">|</span>
                                  <span className="text-red-500 font-bold">{sub.player2BallsPotted || 0}</span>
                                  <span className="ml-1 text-[8px] opacity-70">balls</span>
                                </div>
                              )}
                              {/* Advanced Pool Stats Badges */}
                              {(isPool || isPooker) && (sub.isSevenBallWin || sub.isBlackFinish || sub.isWhitewash) && (
                                <div className="flex flex-wrap gap-1 mt-1 justify-center">
                                  {sub.isSevenBallWin && <span className="text-[8px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-black leading-none whitespace-nowrap">7-Ball Win</span>}
                                  {sub.isBlackFinish && <span className="text-[8px] bg-gray-800 text-gray-100 px-1.5 py-0.5 rounded font-black leading-none whitespace-nowrap">Black</span>}
                                  {sub.isWhitewash && <span className="text-[8px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black leading-none whitespace-nowrap">Whitewash</span>}
                                </div>
                              )}
                            </td>

                            {/* Opponent version */}
                            <td className="px-5 py-3 text-center border-r bg-red-50/10">
                              <div className="flex items-center justify-center gap-2 text-sm font-black">
                                <span className={((String(clm.winnerId) === String(dispute.matchResult?.player1Id)) || (parseInt(clm.player1Score) > parseInt(clm.player2Score))) ? 'text-blue-600' : 'text-gray-400'}>
                                  {clm.player1Score ?? '-'}
                                </span>
                                <span className="text-gray-200">/</span>
                                <span className={((String(clm.winnerId) === String(dispute.matchResult?.player2Id)) || (parseInt(clm.player2Score) > parseInt(clm.player1Score))) ? 'text-red-600' : 'text-gray-400'}>
                                  {clm.player2Score ?? '-'}
                                </span>
                              </div>
                              {(isSnooker || isPooker) && (clm.player1Break !== undefined || clm.player2Break !== undefined) && (
                                <div className="text-[9px] text-gray-400 font-bold mb-1">Brk: {clm.player1Break || 0} / {clm.player2Break || 0}</div>
                              )}
                              {/* Balls Potted */}
                              {(isPool || isPooker) && (clm.player1BallsPotted !== undefined || clm.player2BallsPotted !== undefined) && (
                                <div className="text-[9px] text-gray-500 bg-gray-100/50 rounded px-1.5 py-0.5 mt-1 inline-block">
                                  <span className="text-blue-500 font-bold">{clm.player1BallsPotted || 0}</span>
                                  <span className="mx-1 text-gray-300">|</span>
                                  <span className="text-red-500 font-bold">{clm.player2BallsPotted || 0}</span>
                                  <span className="ml-1 text-[8px] opacity-70">balls</span>
                                </div>
                              )}
                              {/* Advanced Pool Stats Badges */}
                              {(isPool || isPooker) && (clm.isSevenBallWin || clm.isBlackFinish || clm.isWhitewash) && (
                                <div className="flex flex-wrap gap-1 mt-1 justify-center">
                                  {clm.isSevenBallWin && <span className="text-[8px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-black leading-none whitespace-nowrap">7-Ball Win</span>}
                                  {clm.isBlackFinish && <span className="text-[8px] bg-gray-800 text-gray-100 px-1.5 py-0.5 rounded font-black leading-none whitespace-nowrap">Black</span>}
                                  {clm.isWhitewash && <span className="text-[8px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black leading-none whitespace-nowrap">Whitewash</span>}
                                </div>
                              )}
                            </td>

                            {/* Official Decision */}
                            <td className="px-5 py-3 bg-green-50/10">
                              <div className="flex items-center justify-center gap-2">
                                <input
                                  type="number"
                                  value={res.player1Score ?? ''}
                                  onChange={(e) => handleFrameDetailChange(idx, 'player1Score', e.target.value)}
                                  className="w-12 h-8 text-center border rounded-lg text-xs font-black focus:border-green-500"
                                  placeholder="P1"
                                />
                                <span className="text-gray-300">-</span>
                                <input
                                  type="number"
                                  value={res.player2Score ?? ''}
                                  onChange={(e) => handleFrameDetailChange(idx, 'player2Score', e.target.value)}
                                  className="w-12 h-8 text-center border rounded-lg text-xs font-black focus:border-green-500"
                                  placeholder="P2"
                                />
                                {/* Balls Potted & Pool Checkboxes */}
                                {(isPool || isPooker) && (
                                  <div className="flex flex-col items-center gap-1 mt-2">
                                    <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
                                      <input
                                        type="number"
                                        value={res.player1BallsPotted ?? ''}
                                        onChange={(e) => handleFrameDetailChange(idx, 'player1BallsPotted', e.target.value)}
                                        className="w-10 h-6 text-center bg-white border border-blue-100 rounded text-[10px] text-blue-600 font-bold focus:border-blue-500 outline-none"
                                        placeholder="B1"
                                      />
                                      <span className="text-[8px] font-black text-gray-300">/</span>
                                      <input
                                        type="number"
                                        value={res.player2BallsPotted ?? ''}
                                        onChange={(e) => handleFrameDetailChange(idx, 'player2BallsPotted', e.target.value)}
                                        className="w-10 h-6 text-center bg-white border border-red-100 rounded text-[10px] text-red-600 font-bold focus:border-red-500 outline-none"
                                        placeholder="B2"
                                      />
                                    </div>
                                    <div className="flex flex-wrap gap-2 justify-center mt-1">
                                      <label className="flex items-center gap-1 cursor-pointer hover:bg-white p-0.5 rounded transition-colors">
                                        <input type="checkbox" checked={res.isSevenBallWin || false} onChange={e => handleFrameDetailChange(idx, 'isSevenBallWin', e.target.checked, true)} className="w-2.5 h-2.5 text-purple-600 rounded border-gray-300 cursor-pointer" />
                                        <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">7-Ball</span>
                                      </label>
                                      <label className="flex items-center gap-1 cursor-pointer hover:bg-white p-0.5 rounded transition-colors">
                                        <input type="checkbox" checked={res.isBlackFinish || false} onChange={e => handleFrameDetailChange(idx, 'isBlackFinish', e.target.checked, true)} className="w-2.5 h-2.5 text-gray-800 rounded border-gray-300 cursor-pointer" />
                                        <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">Black</span>
                                      </label>
                                      <label className="flex items-center gap-1 cursor-pointer hover:bg-white p-0.5 rounded transition-colors">
                                        <input type="checkbox" checked={res.isWhitewash || false} onChange={e => handleFrameDetailChange(idx, 'isWhitewash', e.target.checked, true)} className="w-2.5 h-2.5 text-blue-600 rounded border-gray-300 cursor-pointer" />
                                        <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">W/W</span>
                                      </label>
                                    </div>
                                  </div>
                                )}
                                {(isSnooker || isPooker) && (
                                  <div className="flex gap-1 ml-2">
                                    <input
                                      type="number"
                                      value={res.player1Break ?? ''}
                                      onChange={(e) => handleFrameDetailChange(idx, 'player1Break', e.target.value)}
                                      className="w-10 h-7 text-center border rounded text-[9px] text-blue-600 font-bold"
                                      placeholder="Brk1"
                                    />
                                    <input
                                      type="number"
                                      value={res.player2Break ?? ''}
                                      onChange={(e) => handleFrameDetailChange(idx, 'player2Break', e.target.value)}
                                      className="w-10 h-7 text-center border rounded text-[9px] text-red-600 font-bold"
                                      placeholder="Brk2"
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="grid grid-cols-2 gap-10">
          {/* Submitter Side */}
          <div className="space-y-4">
            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 text-[10px] font-black text-blue-500/50 uppercase">Claimant</div>
              <div className="text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest">{dispute.submitter?.name || dispute.submitter?.nickname || 'Submitter'}</div>
              <input
                type="number"
                readOnly={!isOverallPointsEnabled}
                value={(isSnooker || isPooker) ? (submitterIsP1 ? resolutionData.finalPlayer1Frames : resolutionData.finalPlayer2Frames) : (submitterIsP1 ? resolutionData.finalPlayer1RackWins : resolutionData.finalPlayer2RackWins)}
                onChange={(e) => {
                  if (!isOverallPointsEnabled) return;
                  handleScoreChange((isSnooker || isPooker) ? (submitterIsP1 ? 'finalPlayer1Frames' : 'finalPlayer2Frames') : (submitterIsP1 ? 'finalPlayer1RackWins' : 'finalPlayer2RackWins'), e.target.value)
                }}
                className={`w-24 text-5xl font-black text-center bg-white border-2 border-gray-100 rounded-2xl p-4 focus:border-blue-600 outline-none transition-all ${!isOverallPointsEnabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
              />
              <div className="text-[10px] font-bold text-gray-400 mt-3">{(isSnooker || isPooker) ? 'Final Frames' : 'Final Racks'}</div>
              {!isOverallPointsEnabled && <div className="text-[7px] font-bold text-gray-400 mt-1 uppercase">Auto-calculated</div>}
            </div>
            <button
              onClick={() => setResolutionData(p => ({ ...p, finalWinnerId: dispute.submitterId }))}
              className={`w-full py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border-2 ${resolutionData.finalWinnerId === dispute.submitterId
                ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100'
                : 'bg-white border-gray-100 text-gray-400'
                }`}
            >
              Declare as Winner
            </button>
          </div>

          {/* Opponent Side */}
          <div className="space-y-4">
            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 text-[10px] font-black text-red-500/50 uppercase">Respondent</div>
              <div className="text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest">{dispute.opponent?.name || dispute.opponent?.nickname || 'Opponent'}</div>
              <input
                type="number"
                readOnly={!isOverallPointsEnabled}
                value={(isSnooker || isPooker) ? (submitterIsP1 ? resolutionData.finalPlayer2Frames : resolutionData.finalPlayer1Frames) : (submitterIsP1 ? resolutionData.finalPlayer2RackWins : resolutionData.finalPlayer1RackWins)}
                onChange={(e) => {
                  if (!isOverallPointsEnabled) return;
                  handleScoreChange((isSnooker || isPooker) ? (submitterIsP1 ? 'finalPlayer2Frames' : 'finalPlayer1Frames') : (submitterIsP1 ? 'finalPlayer2RackWins' : 'finalPlayer1RackWins'), e.target.value)
                }}
                className={`w-24 text-5xl font-black text-center bg-white border-2 border-gray-100 rounded-2xl p-4 focus:border-red-600 outline-none transition-all ${!isOverallPointsEnabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
              />
              <div className="text-[10px] font-bold text-gray-400 mt-3">{(isSnooker || isPooker) ? 'Final Frames' : 'Final Racks'}</div>
              {!isOverallPointsEnabled && <div className="text-[7px] font-bold text-gray-400 mt-1 uppercase">Auto-calculated</div>}
            </div>
            <button
              onClick={() => setResolutionData(p => ({ ...p, finalWinnerId: dispute.opponentId }))}
              className={`w-full py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border-2 ${resolutionData.finalWinnerId === dispute.opponentId
                ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-100'
                : 'bg-white border-gray-100 text-gray-400'
                }`}
            >
              Declare as Winner
            </button>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Administrative Decision Notes</label>
            <span className="text-[10px] font-bold text-gray-300 italic">Visible to both players</span>
          </div>
          <textarea
            className="w-full border-2 border-gray-100 rounded-2xl p-5 text-sm font-medium focus:border-gray-900 outline-none min-h-[120px] transition-all placeholder:text-gray-300"
            placeholder="Provide a brief explanation for the final score adjustment..."
            value={resolutionData.resolutionNotes}
            onChange={(e) => setResolutionData(p => ({ ...p, resolutionNotes: e.target.value }))}
          />
        </div>

        {dispute.imageUrl && (
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 block">Review Photo Evidence</label>
            <button
              onClick={() => window.open(getImageUrl(dispute.imageUrl), '_blank')}
              className="w-full h-40 relative rounded-2xl overflow-hidden group border-2 border-gray-100"
            >
              <img src={getImageUrl(dispute.imageUrl)} alt="Evidence" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="px-6 py-3 bg-white rounded-xl text-gray-900 text-xs font-black uppercase tracking-widest">View Full Size Proof</span>
              </div>
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
