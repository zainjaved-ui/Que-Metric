import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaCheckCircle, FaExclamationTriangle, FaClock, FaHistory, FaTrophy,
  FaUser, FaChevronRight, FaImage, FaTrashAlt, FaCheck, FaTimes, FaClipboard, FaInfoCircle, FaStar
} from 'react-icons/fa';
import Card from '../../../ui/Card';
import Button from '../../../ui/Button';
import Loader from '../../../ui/Loader';
import Modal from '../../../ui/Modal';
import matchResultService from '../../../../Services/matchResultService';
import { useNotification } from '../../../../contexts/NotificationContext';
import { getImageUrl } from '../../../../utils/imageUtils';

export default function Results() {
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'my-submissions', 'history'
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [selectedLeagueFilter, setSelectedLeagueFilter] = useState('all');
  const [disputeReason, setDisputeReason] = useState('');
  const [showDisputeInput, setShowDisputeInput] = useState(null);
  const [selectedResultForDispute, setSelectedResultForDispute] = useState(null);
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
  const [claimedScore, setClaimedScore] = useState({
    winnerId: '',
    player1Frames: 0,
    player2Frames: 0,
    player1RackWins: 0,
    player2RackWins: 0,
    snookerFrameDetails: [],
    poolRackDetails: [],
    pookerFrameDetails: []
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      let rows = [];

      // Tournament submissions flow through MatchResult (match-results API) with matchType "tournament".
      // Merging /tournaments/player-results/* duplicated rows and used a broken submittedBy mapping.
      try {
        if (activeTab === 'pending') {
          const data = await matchResultService.getPendingResults();
          rows = data.data || [];
        } else if (activeTab === 'my-submissions') {
          const data = await matchResultService.getMySubmittedResults();
          rows = data.data || [];
        } else {
          const data = await matchResultService.getCompletedResults();
          rows = data.data || [];
        }
      } catch (error) {
        console.warn('[Results] Match results fetch failed:', error);
        rows = [];
      }

      const sorted = [...rows].sort((a, b) => {
        const dateA = new Date(a.submittedAt || a.reportedDate || 0);
        const dateB = new Date(b.submittedAt || b.reportedDate || 0);
        return dateB - dateA;
      });

      // Log tournament results specifically for debugging
      const tournamentResults = sorted.filter(r => r.matchType === 'tournament' || r.tournamentId);
      console.log('[Results] Fetched data:', {
        count: sorted.length,
        tournamentCount: tournamentResults.length,
        tournaments: tournamentResults.map(r => ({ id: r.id, tournament: r.tournament?.name, status: r.resultStatus }))
      });
      setResults(sorted);
    } catch (error) {
      showToast('Failed to fetch results', 'error');
      console.error('[Results] Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleConfirm = async (resultId) => {
    setActionLoading(resultId);
    try {
      await matchResultService.confirmOrDisputeResult(resultId, true);
      showToast('Result confirmed!', 'success');
      fetchData();
    } catch (error) {
      showToast(error.message || 'Failed to confirm result', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDispute = async (resultId, reason, claimedData) => {
    if (!reason) {
      showToast('Please provide a reason for the dispute', 'warning');
      return;
    }
    setActionLoading(resultId);
    try {
      await matchResultService.confirmOrDisputeResult(resultId, false, reason, claimedData);
      showToast('Dispute submitted', 'info');
      setShowDisputeInput(null);
      setIsDisputeModalOpen(false);
      setDisputeReason('');
      fetchData();
    } catch (error) {
      showToast(error.message || 'Failed to submit dispute', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const openDisputeModal = (result) => {
    setSelectedResultForDispute(result);
    setDisputeReason('');

    // Initialize claimedScore with original data
    const isSnooker = result.sport === 'snooker' || result.sport === 'pooker';
    let frameData = (result.sport === 'snooker' || result.sport === 'pooker') ?
      (result.pookerFrameDetails || result.snookerFrameDetails) :
      result.poolRackDetails;

    // Safe JSON parse if needed
    let parsedFrames = frameData;
    if (typeof frameData === 'string') {
      try { parsedFrames = JSON.parse(frameData); } catch (e) { parsedFrames = []; }
    }

    setClaimedScore({
      winnerId: result.winnerId || '',
      player1Frames: result.player1Frames || 0,
      player2Frames: result.player2Frames || 0,
      player1RackWins: result.player1RackWins || 0,
      player2RackWins: result.player2RackWins || 0,
      snookerFrameDetails: result.sport === 'snooker' ? (Array.isArray(parsedFrames) ? JSON.parse(JSON.stringify(parsedFrames)) : []) : [],
      pookerFrameDetails: result.sport === 'pooker' ? (Array.isArray(parsedFrames) ? JSON.parse(JSON.stringify(parsedFrames)) : []) : [],
      poolRackDetails: result.sport === 'pool' ? (Array.isArray(parsedFrames) ? JSON.parse(JSON.stringify(parsedFrames)) : []) : [],
      highestBreak: result.highestBreak || 0,
      player1BallsPotted: result.player1BallsPotted || 0,
      player2BallsPotted: result.player2BallsPotted || 0,
    });

    setIsDisputeModalOpen(true);
  };

  const getStatusBadge = (status, matchType) => {
    switch (status) {
      case 'Pending': return <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[8.5px] font-black uppercase tracking-widest border border-amber-100">Pending</span>;
      case 'Awaiting Admin Approval': return <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[8.5px] font-black uppercase tracking-widest border border-blue-100">Pending Review</span>;
      case 'Confirmed': return <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[8.5px] font-black uppercase tracking-widest border border-emerald-100">Confirmed</span>;
      case 'Disputed': return <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-[8.5px] font-black uppercase tracking-widest border border-red-100">Disputed</span>;
      case 'Walkover':
      case 'walkover': return <span className="px-3 py-1 bg-orange-50 text-orange-600 rounded-full text-[8.5px] font-black uppercase tracking-widest border border-orange-100">Walkover</span>;
      case 'Forfeit':
      case 'forfeit': return <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-[8.5px] font-black uppercase tracking-widest border border-red-100">Forfeit</span>;
      case 'pending_confirmation':
        return matchType === 'tournament'
          ? <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold uppercase flex items-center gap-1">⏳ Your Confirmation Needed</span>
          : <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold uppercase">Pending</span>;
      default: return null;
    }
  };

  const renderResultCard = (result) => {
    // Normalize score values
    const sport = String(result.sport || '').toLowerCase();
    const isFrameBased = sport === 'snooker' || sport === 'pooker' || sport === 'poker';
    let p1Score = isFrameBased ? (result.player1Frames ?? 0) : (result.player1RackWins ?? 0);
    let p2Score = isFrameBased ? (result.player2Frames ?? 0) : (result.player2RackWins ?? 0);

    const frameDataForScoreCalc = isFrameBased ?
      (result.pookerFrameDetails || result.snookerFrameDetails || result.pokerResults) :
      result.poolRackDetails;

    if (p1Score === 0 && p2Score === 0 && frameDataForScoreCalc) {
      let parsedFrames = frameDataForScoreCalc;
      if (typeof frameDataForScoreCalc === 'string') {
        try { parsedFrames = JSON.parse(frameDataForScoreCalc); } catch (e) { parsedFrames = []; }
      }
      if (Array.isArray(parsedFrames) && parsedFrames.length > 0) {
        // Calculate wins based on frame scores, including zeros
        p1Score = parsedFrames.filter(f => (parseInt(f.player1Score) || 0) > (parseInt(f.player2Score) || 0)).length;
        p2Score = parsedFrames.filter(f => (parseInt(f.player2Score) || 0) > (parseInt(f.player1Score) || 0)).length;
      }
    }

    const submitterIsPlayer1 = result.submittedBy === result.player1?.id;
    const leftPlayer = result.player1;
    const rightPlayer = result.player2;
    const leftScore = p1Score;
    const rightScore = p2Score;
    const leftLabel = submitterIsPlayer1 ? 'Submitter' : 'Opponent';
    const rightLabel = submitterIsPlayer1 ? 'Opponent' : 'Submitter';

    return (
      <Card className="rounded-[2rem] border-gray-100/50 shadow-xl shadow-[#132F45]/5 hover:shadow-[#132F45]/10 transition-all duration-500 overflow-hidden relative group">
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-3 bg-[#BA995D] rounded-full" />
              <span className="text-[7.5px] font-black uppercase tracking-widest text-gray-400">
                {result.league?.name || result.booking?.league?.name || result.tournament?.name || 'Friendly Match'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`px-2.5 py-1 rounded-lg text-[7px] font-black uppercase tracking-wider ${result.isWalkover ? 'bg-orange-50 text-orange-600 border border-orange-100' :
                result.resultStatus === 'Confirmed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                  result.resultStatus === 'Pending' || result.resultStatus === 'Awaiting Admin Approval' ? 'bg-amber-50 text-amber-600 border border-amber-100 animate-pulse' :
                    'bg-red-50 text-red-600 border border-red-100'
                }`}>
                {result.isWalkover ? 'WALKOVER' : (result.resultStatus === 'Awaiting Admin Approval' ? 'Pending Approval' : result.resultStatus)}
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-between gap-4 mb-4 relative pb-4">
            <div className="text-center z-10 flex-1">
              <div className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{leftLabel}</div>
              <div className="font-black text-[#132F45] text-[9px] uppercase truncate mb-1">{leftPlayer?.name || 'Player'}</div>
              <div className="text-2xl font-black text-[#132F45] tracking-tighter drop-shadow-sm">{leftScore}</div>
            </div>

            <div className="flex flex-col items-center gap-1 px-1 z-10">
              <div className="w-6 h-6 rounded-full bg-white shadow-md border border-gray-50 flex items-center justify-center text-[7px] font-black text-gray-300 italic">VS</div>
            </div>

            <div className="text-center z-10 flex-1">
              <div className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{rightLabel}</div>
              <div className="font-black text-[#132F45] text-[9px] uppercase truncate mb-1">{rightPlayer?.name || 'Player'}</div>
              <div className="text-2xl font-black text-[#BA995D] tracking-tighter drop-shadow-sm">{rightScore}</div>
            </div>
          </div>

          {/* Winner Highlight */}
          {(() => {
            let computedWinnerId;
            if (p1Score > p2Score) computedWinnerId = result.player1?.id;
            else if (p2Score > p1Score) computedWinnerId = result.player2?.id;
            else computedWinnerId = result.winnerId || null;

            const computedWinnerName = (computedWinnerId && (computedWinnerId === result.player1?.id ? result.player1?.name : result.player2?.name)) || result.winner?.name || 'Draw';

            return (
              <div className="flex justify-center mb-5">
                <div className="inline-flex items-center gap-2 bg-[#132F45] text-white px-3.5 py-1 rounded-full text-[8.5px] font-black uppercase tracking-widest shadow-lg shadow-[#132F45]/20">
                  <FaTrophy className="text-[#BA995D] text-[10px]" />
                  Winner: <span className="text-[#BA995D]">{computedWinnerName}</span>
                </div>
              </div>
            );
          })()}

          <div className="flex flex-wrap gap-2 mb-6">
            <div className="flex items-center gap-2 text-[8.5px] font-black text-gray-400 uppercase bg-[#FAFAFA] px-3.5 py-2.5 rounded-xl border border-gray-50 flex-[1_0_auto] justify-center">
              <FaClock className="text-[#BA995D]" /> {new Date(result.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>

            {(result.sport === 'snooker' || result.sport === 'pooker') && result.highestBreak > 0 && (
              <div className="flex items-center gap-1.5 text-[8.5px] font-black text-[#132F45] uppercase bg-blue-50 px-3.5 py-2.5 rounded-xl border border-blue-100 flex-[1_0_auto] justify-center">
                <FaStar className="text-amber-500" /> Break: <span className="text-blue-600 px-1.5 py-0.5 bg-white rounded-md shadow-sm">{result.highestBreak}</span>
              </div>
            )}

            {(result.sport === 'pool' || result.sport === 'pooker') && (result.player1BallsPotted > 0 || result.player2BallsPotted > 0 || result.player1SevenBallWins > 0 || result.player2SevenBallWins > 0) && (
              <div className="flex items-center gap-1.5 text-[8.5px] font-black text-[#132F45] uppercase bg-purple-50 px-3.5 py-2.5 rounded-xl border border-purple-100 flex-[1_0_auto] justify-center w-full sm:w-auto">
                {(result.player1BallsPotted > 0 || result.player2BallsPotted > 0) && (
                  <>
                    <span className="text-purple-600">Balls:</span>
                    <span className="text-gray-500">{leftPlayer?.name?.split(' ')[0]}</span> <span className="text-purple-700 bg-white px-1.5 py-0.5 rounded-md shadow-sm">{result.player1BallsPotted}</span>
                    <span className="text-gray-300 mx-1">|</span>
                    <span className="text-gray-500">{rightPlayer?.name?.split(' ')[0]}</span> <span className="text-purple-700 bg-white px-1.5 py-0.5 rounded-md shadow-sm">{result.player2BallsPotted}</span>
                  </>
                )}
                {(result.player1SevenBallWins > 0 || result.player2SevenBallWins > 0) && (
                  <>
                    <span className="text-gray-300 mx-1">•</span>
                    <span className="text-yellow-600">7-Balls:</span>
                    <span className="text-gray-500">{leftPlayer?.name?.split(' ')[0]}</span> <span className="text-yellow-700 bg-white px-1.5 py-0.5 rounded-md shadow-sm">{result.player1SevenBallWins}</span>
                    <span className="text-gray-300 mx-1">|</span>
                    <span className="text-gray-500">{rightPlayer?.name?.split(' ')[0]}</span> <span className="text-yellow-700 bg-white px-1.5 py-0.5 rounded-md shadow-sm">{result.player2SevenBallWins}</span>
                  </>
                )}
              </div>
            )}

            {result.imageUrl && (
              <a href={getImageUrl(result.imageUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-[8.5px] font-black text-[#132F45] uppercase bg-[#FDF2D1] px-3.5 py-2.5 rounded-xl border border-[#BA995D]/20 hover:bg-[#BA995D] hover:text-white transition-all flex-[1_0_auto]">
                <FaImage size={11} /> Proof
              </a>
            )}
          </div>

          {result.notes && (
            <div className="mb-6 p-3.5 bg-blue-50/50 rounded-xl border border-blue-100/50 italic text-[10px] text-[#132F45] font-medium leading-relaxed">
              "{result.notes}"
            </div>
          )}

          {/* Match Statistics Summary - for Pool/Pooker */}
          {(result.sport === 'pool' || result.sport === 'pooker') && (result.player1BallsPotted !== undefined || result.player2BallsPotted !== undefined || result.player1SevenBallWins !== undefined || result.player2SevenBallWins !== undefined) && (
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-100 mb-6">
              <h3 className="text-[9px] font-black text-[#132F45] mb-3 flex items-center gap-2 uppercase tracking-widest">
                📊 Match Stats
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Balls Potted */}
                {(result.player1BallsPotted !== undefined || result.player2BallsPotted !== undefined) && (
                  <>
                    <div className="bg-white rounded-lg p-3 border border-purple-100">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider mb-1">Balls</p>
                      <p className="text-xl font-black text-purple-600">{result.player1BallsPotted ?? 0}</p>
                      <p className="text-[8px] text-gray-400 mt-1 truncate">{leftPlayer?.name?.split(' ')[0]}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-purple-100">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider mb-1">Balls</p>
                      <p className="text-xl font-black text-purple-600">{result.player2BallsPotted ?? 0}</p>
                      <p className="text-[8px] text-gray-400 mt-1 truncate">{rightPlayer?.name?.split(' ')[0]}</p>
                    </div>
                  </>
                )}

                {/* 7-Ball Wins */}
                {(result.player1SevenBallWins !== undefined || result.player2SevenBallWins !== undefined) && (
                  <>
                    <div className="bg-white rounded-lg p-3 border border-yellow-100">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider mb-1">7-Ball</p>
                      <p className="text-xl font-black text-yellow-600">{result.player1SevenBallWins ?? 0}</p>
                      <p className="text-[8px] text-gray-400 mt-1 truncate">{leftPlayer?.name?.split(' ')[0]}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-yellow-100">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider mb-1">7-Ball</p>
                      <p className="text-xl font-black text-yellow-600">{result.player2SevenBallWins ?? 0}</p>
                      <p className="text-[8px] text-gray-400 mt-1 truncate">{rightPlayer?.name?.split(' ')[0]}</p>
                    </div>
                  </>
                )}

                {/* Black Finishes (Pooker only) */}
                {result.sport === 'pooker' && (result.player1BlackFinishes !== undefined || result.player2BlackFinishes !== undefined) && (
                  <>
                    <div className="bg-white rounded-lg p-3 border border-gray-900 border-opacity-20">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider mb-1">Black</p>
                      <p className="text-xl font-black text-gray-800">{result.player1BlackFinishes ?? 0}</p>
                      <p className="text-[8px] text-gray-400 mt-1 truncate">{leftPlayer?.name?.split(' ')[0]}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-900 border-opacity-20">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider mb-1">Black</p>
                      <p className="text-xl font-black text-gray-800">{result.player2BlackFinishes ?? 0}</p>
                      <p className="text-[8px] text-gray-400 mt-1 truncate">{rightPlayer?.name?.split(' ')[0]}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Evidence Preview */}
          {result.imageUrl && (
            <div className="mb-6 group cursor-pointer" onClick={() => window.open(getImageUrl(result.imageUrl), '_blank')}>
              <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2.5 flex items-center gap-2">
                <div className="w-1 h-2.5 bg-[#BA995D] rounded-full" /> Match Photo
              </h4>
              <div className="relative block w-full h-36 rounded-2xl overflow-hidden border border-gray-100 bg-[#FAFAFA]">
                <img
                  src={getImageUrl(result.imageUrl)}
                  alt="Proof"
                  className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-[#132F45]/60 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center backdrop-blur-[2px]">
                  <div className="bg-white text-[#132F45] text-[9px] font-black uppercase tracking-widest px-5 py-2 rounded-full shadow-2xl transform translate-y-3 group-hover:translate-y-0 transition-all duration-500">
                    View Full Screen
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Frame/Rack Breakdown */}
          {(((result.sport === 'snooker' || result.sport === 'pooker') && (result.snookerFrameDetails || result.pookerFrameDetails)) ||
            (result.sport === 'pool' && result.poolRackDetails)) && (
              <div className="bg-[#FAFAFA] rounded-2xl p-5 border border-gray-50 mb-6">
                <h3 className="text-[10px] font-black text-[#132F45] uppercase tracking-widest mb-3 flex items-center gap-2">
                  <FaClipboard size={10} className="text-[#BA995D]" />
                  {(result.sport === 'snooker' || result.sport === 'pooker') ? 'Frame-by-Frame' : 'Rack-by-Rack'}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-[9px]">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="py-2 text-left font-black text-gray-400 uppercase">#</th>
                        {/* <th className="py-2 text-center font-black text-gray-400 uppercase">{leftPlayer?.name?.split(' ')[0]} {result.sport === 'pooker' ? '(Pts / Balls)' : ''}</th>
                      <th className="py-2 text-center font-black text-gray-400 uppercase">{rightPlayer?.name?.split(' ')[0]} {result.sport === 'pooker' ? '(Pts / Balls)' : ''}</th> */}
                        <th className="py-2 text-center font-black text-gray-400 uppercase">{leftPlayer?.name} {result.sport === 'pooker' ? '(Pts / Balls)' : ''}</th>
                        <th className="py-2 text-center font-black text-gray-400 uppercase">{rightPlayer?.name} {result.sport === 'pooker' ? '(Pts / Balls)' : ''}</th>
                        <th className="py-2 text-right font-black text-gray-400 uppercase">Winner</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(() => {
                        let frameData = (result.sport === 'snooker' || result.sport === 'pooker') ? (result.pookerFrameDetails || result.snookerFrameDetails) : result.poolRackDetails;
                        if (typeof frameData === 'string') { try { frameData = JSON.parse(frameData); } catch (e) { frameData = []; } }
                        return frameData?.map((frame, index) => {
                          const p1 = parseInt(frame.player1Score) || 0;
                          const p2 = parseInt(frame.player2Score) || 0;
                          const winName = p1 > p2 ? leftPlayer?.name : p2 > p1 ? rightPlayer?.name : 'Draw';
                          const winCls = p1 > p2 ? 'text-blue-600' : p2 > p1 ? 'text-[#BA995D]' : 'text-gray-400';

                          let dLS = frame.player1Score || '-';
                          let dRS = frame.player2Score || '-';

                          if (result.sport === 'pooker') {
                            dLS = `${dLS} / ${frame.player1BallsPotted || '-'}`;
                            dRS = `${dRS} / ${frame.player2BallsPotted || '-'}`;
                          }

                          return (
                            <tr key={index} className="hover:bg-white transition-colors">
                              <td className="py-2.5 font-black text-gray-300">{(index + 1).toString().padStart(2, '0')}</td>
                              <td className="py-2.5 text-center font-black text-[#132F45]">{dLS}</td>
                              <td className="py-2.5 text-center font-black text-[#BA995D]">{dRS}</td>
                              <td className={`py-2.5 text-right font-black uppercase tracking-tighter ${winCls}`}>{winName}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {activeTab === 'pending' && (
            <div className="mt-6 flex gap-3 pt-5 border-t border-gray-50">
              <Button
                onClick={() => handleConfirm(result.id)}
                variant="primary"
                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-[9px] font-black uppercase tracking-widest rounded-xl py-3.5 shadow-xl shadow-green-600/10 flex items-center justify-center gap-2"
                loading={actionLoading === result.id}
              >
                <FaCheck size={10} /> Confirm
              </Button>
              {(() => {
                // For league results, check league reporting settings
                // For tournament results, always allow disputes (tournaments don't have reporting restrictions in the same way)
                const reporting = result.league?.reporting || result.booking?.league?.reporting;
                const isTournamentResult = result.matchType === 'tournament' || (result.tournamentId && !result.leagueId);

                if (!isTournamentResult && reporting?.dispute?.enabled === false) {
                  return <div className="flex-1 px-4 py-3.5 bg-gray-50 text-gray-400 rounded-xl text-[8px] font-black uppercase tracking-widest text-center border border-gray-100">Disputes Locked</div>;
                }
                return (
                  <Button
                    onClick={() => openDisputeModal(result)}
                    variant="secondary"
                    className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 text-[9px] font-black uppercase tracking-widest rounded-xl py-3.5 flex items-center justify-center gap-2"
                  >
                    <FaTimes size={10} /> Dispute
                  </Button>
                );
              })()}
            </div>
          )}
        </div>
      </Card>
    );
  };

  const TABS = [
    { id: 'pending', label: 'To Confirm', icon: FaClock },
    { id: 'my-submissions', label: 'My Reports', icon: FaClipboard },
    { id: 'history', label: 'History', icon: FaHistory },
  ];

  if (loading) return <Loader text="Loading Results..." />;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">

      {/* ── Hero Header ──────────────────────────────────────────────── */}
      <div className="bg-[#132F45] px-4 sm:px-6 py-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center gap-3">
                <div className="w-6 h-[1px] bg-[#BA995D]" /> Match History
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">
                Recent Results
              </h1>
              <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] mt-3.5 max-w-md leading-relaxed">
                Check and confirm your match results.
              </p>
            </div>

            <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 backdrop-blur-xl">
              {[
                { label: 'Pending', value: results.filter(r => r.resultStatus === 'Pending').length, color: 'text-amber-400' },
                { label: 'Confirmed', value: results.filter(r => r.resultStatus === 'Confirmed').length, color: 'text-[#BA995D]' },
                { label: 'Disputed', value: results.filter(r => r.resultStatus === 'Disputed').length, color: 'text-red-500' },
              ].map(s => (
                <div key={s.label} className="px-3 py-1.5 border-r border-white/5 last:border-0 flex flex-col items-center">
                  <span className={`text-base font-black tracking-tighter ${s.color}`}>{s.value}</span>
                  <span className="text-[6px] font-black uppercase tracking-widest text-white/30 mt-0.5">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-10 flex flex-col gap-8">

        {/* Controls Row */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#FDF2D1] pb-0 sm:pb-2">
          {/* Tabs */}
          <div className="flex gap-0 overflow-x-auto w-full sm:w-auto no-scrollbar">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSelectedLeagueFilter('all'); }}
                className={`relative px-6 py-3 font-black text-[8.5px] uppercase tracking-widest flex items-center gap-2.5 whitespace-nowrap transition-all duration-300 ${activeTab === tab.id
                  ? 'text-[#132F45]'
                  : 'text-gray-400 hover:text-[#132F45] hover:bg-[#FAFAFA]'
                  }`}
              >
                <tab.icon size={11} className={activeTab === tab.id ? 'text-[#BA995D]' : 'text-gray-300'} />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute -bottom-2 sm:bottom-0 left-0 right-0 h-0.5 bg-[#BA995D]" />
                )}
              </button>
            ))}
          </div>

          {/* League Filter */}
          {(() => {
            const availableLeagues = Array.from(new Set(results.map(r => r.league?.name || r.booking?.league?.name || r.tournament?.name || 'Friendly Match'))).filter(Boolean);
            if (availableLeagues.length <= 1) return null;
            return (
              <div className="w-full sm:w-auto px-1 sm:px-0 mb-2 sm:mb-0">
                <div className="relative">
                  <select
                    value={selectedLeagueFilter}
                    onChange={(e) => setSelectedLeagueFilter(e.target.value)}
                    className="w-full sm:w-56 appearance-none bg-[#FAFAFA] border border-gray-100 text-[#132F45] text-[8.5px] font-black uppercase tracking-widest rounded-xl pl-4 pr-10 py-3 focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none shadow-sm cursor-pointer"
                  >
                    <option value="all">All Competitions</option>
                    {availableLeagues.map((lg, i) => (
                      <option key={i} value={lg}>{lg}</option>
                    ))}
                  </select>
                  <div className="absolute top-1/2 right-4 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <FaChevronRight className="rotate-90 text-[10px]" />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Results Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map(i => <div key={i} className="h-72 bg-white rounded-[2.5rem] animate-pulse border border-gray-50" />)}
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(() => {
              const filteredResults = results.filter(r => {
                // Exclude disputed results from pending tab
                if (activeTab === 'pending' && r.resultStatus === 'Disputed') {
                  return false;
                }

                // Include results that match the selected filter
                if (selectedLeagueFilter === 'all') return true;

                // Get the competition name - for tournaments, use tournament name
                const resultCompetition = r.league?.name || r.booking?.league?.name || r.tournament?.name || 'Friendly Match';
                return resultCompetition === selectedLeagueFilter;
              });

              return filteredResults.length > 0 ? (
                filteredResults.map(renderResultCard)
              ) : (
                <div className="col-span-full py-16 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">No matches found for the selected competition.</div>
              );
            })()}
          </div>
        ) : (
          <div className="py-20 text-center bg-white rounded-2xl border-2 border-dashed border-[#FDF2D1] shadow-xl shadow-[#132F45]/5 flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-[#FDF2D1]/30 flex items-center justify-center">
              {activeTab === 'pending'
                ? <FaCheckCircle className="text-2xl text-[#BA995D]/30" />
                : <FaHistory className="text-2xl text-[#BA995D]/30" />}
            </div>
            <div className="max-w-sm px-6">
              <h3 className="text-lg font-black text-[#132F45] uppercase tracking-tight">
                {activeTab === 'pending' ? 'All Clear' : 'No Records'}
              </h3>
              <p className="text-gray-400 font-black text-[9px] uppercase tracking-widest leading-relaxed mt-2.5">
                {activeTab === 'pending'
                  ? 'No matches are waiting for your confirmation.'
                  : 'Your match history is empty.'}
              </p>
            </div>
            {activeTab !== 'pending' && (
              <button
                onClick={() => window.location.href = '/player/uploadscore'}
                className="px-10 py-4 bg-[#132F45] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#1c4566] transition-all shadow-xl shadow-[#132F45]/20 flex items-center gap-3"
              >
                <FaClipboard size={12} /> Submit a Result
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dispute Modal */}
      <DisputeModal
        isOpen={isDisputeModalOpen}
        onClose={() => setIsDisputeModalOpen(false)}
        result={selectedResultForDispute}
        claimedScore={claimedScore}
        setClaimedScore={setClaimedScore}
        disputeReason={disputeReason}
        setDisputeReason={setDisputeReason}
        onSubmit={(reason, data) => handleDispute(selectedResultForDispute.id, reason, data)}
        loading={actionLoading === (selectedResultForDispute?.id)}
      />
    </div>
  );
}

function DisputeModal({ isOpen, onClose, result, claimedScore, setClaimedScore, disputeReason, setDisputeReason, onSubmit, loading }) {
  if (!result) return null;

  const handleFrameChange = (index, field, value) => {
    setClaimedScore(prev => {
      const sport = result.sport;
      const isSnooker = sport === 'snooker';
      const isPooker = sport === 'pooker';
      const detailsKey = isSnooker ? 'snookerFrameDetails' :
        isPooker ? 'pookerFrameDetails' : 'poolRackDetails';

      const newDetails = [...(prev[detailsKey] || [])];
      newDetails[index] = { ...newDetails[index], [field]: value === '' ? '' : (parseInt(value) || 0) };


      // Auto-recalculate totals - use 0 for empty strings in calculations
      let p1Total = 0;
      let p2Total = 0;

      newDetails.forEach(frame => {
        const fp1 = parseInt(frame.player1Score) || 0;
        const fp2 = parseInt(frame.player2Score) || 0;
        if (fp1 > fp2) p1Total++;
        else if (fp2 > fp1) p2Total++;
      });

      const scoreKey1 = (isSnooker || isPooker) ? 'player1Frames' : 'player1RackWins';
      const scoreKey2 = (isSnooker || isPooker) ? 'player2Frames' : 'player2RackWins';

      let newWinnerId = prev.winnerId;
      if (p1Total > p2Total) newWinnerId = result.player1Id;
      else if (p2Total > p1Total) newWinnerId = result.player2Id;
      else newWinnerId = null;

      return {
        ...prev,
        [detailsKey]: newDetails,
        [scoreKey1]: p1Total,
        [scoreKey2]: p2Total,
        winnerId: newWinnerId
      };
    });
  };

  const isSnooker = result.sport === 'snooker';
  const isPooker = result.sport === 'pooker';
  const isPool = result.sport === 'pool';

  const matchRules = result?.league?.matchRules || result?.booking?.league?.matchRules;
  let parsedRules = {};
  if (typeof matchRules === 'string') {
    try { parsedRules = JSON.parse(matchRules); } catch (_e) { /* invalid JSON, use empty defaults */ }
  } else if (matchRules) {
    parsedRules = matchRules;
  }

  // 'frame_by_frame' means the overall score must be derived automatically from per-frame data.
  // 'overall' (or no setting) means the player can directly edit the total score.
  const isFrameByFrame = parsedRules.scoreDetail === 'frame_by_frame';

  // Live-computed totals from current frame edits (used for the read-only display in frame_by_frame mode)
  const frameDetails = isSnooker ? claimedScore.snookerFrameDetails : isPooker ? claimedScore.pookerFrameDetails : claimedScore.poolRackDetails;
  const computedP1Total = (frameDetails || []).filter(f => (parseInt(f.player1Score) || 0) > (parseInt(f.player2Score) || 0)).length;
  const computedP2Total = (frameDetails || []).filter(f => (parseInt(f.player2Score) || 0) > (parseInt(f.player1Score) || 0)).length;

  const footer = (
    <div className="flex gap-3 justify-end w-full px-6 pb-6">
      <Button
        variant="secondary"
        onClick={onClose}
        disabled={loading}
        className="px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-gray-100 hover:bg-gray-50 bg-white text-gray-400"
      >
        Cancel
      </Button>
      <Button
        variant="primary"
        className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20"
        onClick={() => {
          // In frame-by-frame mode, always inject the computed totals into the payload
          // so the backend gets accurate derived values, not stale state.
          if (isFrameByFrame) {
            const computedWinner = computedP1Total > computedP2Total
              ? result.player1Id
              : computedP2Total > computedP1Total
                ? result.player2Id
                : null;
            const mergedScore = {
              ...claimedScore,
              ...(isSnooker ? { player1Frames: computedP1Total, player2Frames: computedP2Total }
                : isPooker ? { player1Frames: computedP1Total, player2Frames: computedP2Total }
                  : { player1RackWins: computedP1Total, player2RackWins: computedP2Total }),
              winnerId: computedWinner,
            };
            onSubmit(disputeReason, mergedScore);
          } else {
            onSubmit(disputeReason, claimedScore);
          }
        }}
        loading={loading}
      >
        Confirm Dispute Results
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dispute Match Result" footer={footer} size="2xl" className="rounded-2xl overflow-hidden">
      <div className="space-y-6 p-5">
        {(result.status?.toLowerCase() === 'walkover' || result.isWalkover) && (
          <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex items-center gap-4">
            <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
              <FaTrophy />
            </div>
            <div>
              <p className="text-[10px] font-black text-orange-700 uppercase tracking-widest leading-none mb-1">Walkover Result</p>
              <p className="text-[10px] text-orange-600 font-bold">This result was recorded as a walkover. Disputing this means you claim the match was actually played or the walkover was awarded incorrectly.</p>
            </div>
          </div>
        )}
        <div className="bg-red-50 p-5 rounded-xl border border-red-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-100/50 rounded-bl-full -mr-8 -mt-8"></div>
          <div className="flex gap-4 relative z-10">
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
              <FaExclamationTriangle className="text-lg" />
            </div>
            <div className="space-y-0.5">
              <h4 className="text-[9px] font-black text-red-700 uppercase tracking-widest">Correction Required</h4>
              <p className="text-[10px] text-red-600 font-bold leading-relaxed">
                Provide the scores as they were actually recorded. This information will be sent to the organization admin for final resolution.
              </p>
            </div>
          </div>
        </div>

        {result.imageUrl && (
          <div className="space-y-3">
            <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <div className="w-1 h-2.5 bg-[#BA995D] rounded-full" /> Review Photo
            </h4>
            <div className="relative group aspect-video rounded-2xl overflow-hidden border border-gray-100 bg-[#FAFAFA] shadow-sm">
              <img
                src={getImageUrl(result.imageUrl)}
                alt="Proof"
                className="w-full h-full object-contain p-4 transition-transform duration-700 group-hover:scale-105"
              />
              <a
                href={getImageUrl(result.imageUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 bg-[#132F45]/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px]"
              >
                <span className="bg-white text-[#132F45] text-[9px] font-black uppercase tracking-widest px-6 py-2.5 rounded-full shadow-2xl">
                  View Original Full Proof
                </span>
              </a>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-5">

            {/* ── Frame-by-Frame Mode: read-only auto-calculated scoreboard ── */}
            {isFrameByFrame ? (
              <>
                <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1 h-2.5 bg-[#BA995D] rounded-full" /> Auto Score
                </h3>

                {/* Info banner */}
                <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
                  </svg>
                  <p className="text-[9px] font-bold text-blue-700 leading-relaxed">
                    This league uses <span className="font-black uppercase">Frame-by-Frame</span> scoring. Edit the individual frame scores below — the overall score is automatically calculated and cannot be changed manually.
                  </p>
                </div>

                {/* Read-only live scoreboard */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest px-1">{result.player1?.name}</label>
                    <div className="relative">
                      <div className="w-full bg-blue-50/70 rounded-xl py-3 font-black text-center text-2xl text-[#132F45] shadow-inner select-none">
                        {computedP1Total}
                      </div>
                      <div className="absolute top-1/2 left-3 -translate-y-1/2 text-[7px] font-black text-blue-300 uppercase">FRM</div>
                      <div className="text-[7px] text-center text-blue-400 mt-1 uppercase font-black">Auto-calculated</div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest px-1 text-right">{result.player2?.name}</label>
                    <div className="relative">
                      <div className="w-full bg-[#FDF2D1]/70 rounded-xl py-3 font-black text-center text-2xl text-[#BA995D] shadow-inner select-none">
                        {computedP2Total}
                      </div>
                      <div className="absolute top-1/2 right-3 -translate-y-1/2 text-[7px] font-black text-[#BA995D]/30 uppercase">FRM</div>
                      <div className="text-[7px] text-center text-[#BA995D]/60 mt-1 uppercase font-black">Auto-calculated</div>
                    </div>
                  </div>
                </div>

                {(isSnooker || isPooker) && (
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 px-1">
                      Highest Break <span className="w-1 h-2.5 bg-[#BA995D] rounded-full inline-block" />
                    </label>
                    <input
                      type="number"
                      value={claimedScore.highestBreak ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setClaimedScore((p) => ({ ...p, highestBreak: val === '' ? '' : (parseInt(val, 10) || 0) }));
                      }}
                      className="w-full border border-gray-100 bg-[#FAFAFA] rounded-xl px-4 py-2.5 text-sm font-bold text-[#132F45] focus:ring-2 focus:ring-[#132F45]/5"
                      placeholder="Enter break score..."
                    />
                  </div>
                )}
              </>
            ) : (
              /* ── Overall Mode: editable score inputs ── */
              <>
                <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1 h-2.5 bg-[#BA995D] rounded-full" /> Corrected Totals
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest px-1">{result.player1?.name}</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={((isSnooker || isPooker) ? claimedScore.player1Frames : claimedScore.player1RackWins) ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setClaimedScore((p) => ({
                            ...p,
                            [(isSnooker || isPooker) ? 'player1Frames' : 'player1RackWins']: val === '' ? '' : (parseInt(val, 10) || 0),
                          }));
                        }}
                        className="w-full border-none bg-blue-50/50 rounded-xl py-3 font-black text-center text-xl text-[#132F45] focus:ring-2 focus:ring-[#132F45]/10 shadow-inner"
                      />
                      <div className="absolute top-1/2 left-3 -translate-y-1/2 text-[8px] font-black text-blue-300 uppercase">PTS</div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest px-1 text-right">{result.player2?.name}</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={((isSnooker || isPooker) ? claimedScore.player2Frames : claimedScore.player2RackWins) ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setClaimedScore((p) => ({
                            ...p,
                            [(isSnooker || isPooker) ? 'player2Frames' : 'player2RackWins']: val === '' ? '' : (parseInt(val, 10) || 0),
                          }));
                        }}
                        className="w-full border-none bg-[#FDF2D1]/50 rounded-xl py-3 font-black text-center text-xl text-[#BA995D] focus:ring-2 focus:ring-[#BA995D]/10 shadow-inner"
                      />
                      <div className="absolute top-1/2 right-3 -translate-y-1/2 text-[8px] font-black text-[#BA995D]/30 uppercase">PTS</div>
                    </div>
                  </div>
                </div>
                {(isSnooker || isPooker) && (
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 px-1">
                      Highest Break <span className="w-1 h-2.5 bg-[#BA995D] rounded-full inline-block" />
                    </label>
                    <input
                      type="number"
                      value={claimedScore.highestBreak ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setClaimedScore((p) => ({ ...p, highestBreak: val === '' ? '' : (parseInt(val, 10) || 0) }));
                      }}
                      className="w-full border border-gray-100 bg-[#FAFAFA] rounded-xl px-4 py-2.5 text-sm font-bold text-[#132F45] focus:ring-2 focus:ring-[#132F45]/5"
                      placeholder="Enter break score..."
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-3.5">
            <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <div className="w-1 h-2.5 bg-red-200 rounded-full" /> Dispute Justification
            </h3>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Briefly explain why you are disputing this result (e.g. 'Opponent entered wrong score for Frame 2')..."
              className="w-full border border-red-50 bg-red-50/20 rounded-xl p-3.5 text-xs font-bold text-red-900 focus:ring-2 focus:ring-red-100 focus:outline-none min-h-[140px] resize-none"
            />
          </div>
        </div>

        <div className="space-y-5 pt-6 border-t border-gray-50">
          <div className="flex items-center justify-between">
            <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <div className="w-1 h-2.5 bg-[#BA995D] rounded-full" />
              {isPool ? 'Rack-by-Rack Audit' : 'Frame-by-Frame Audit'}
            </h3>
            <div className="text-[8px] font-black text-[#BA995D] bg-[#FDF2D1] px-2.5 py-0.5 rounded-full uppercase tracking-widest">
              Overwrites
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[280px] overflow-y-auto pr-2 no-scrollbar">
            {(isSnooker ? claimedScore.snookerFrameDetails : isPooker ? claimedScore.pookerFrameDetails : claimedScore.poolRackDetails)?.map((frame, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all outline outline-1 outline-gray-50"
              >
                <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                  <span className="text-[8.5px] font-black text-[#BA995D] uppercase tracking-widest">
                    {isPool ? 'Rack' : 'Frame'} {(idx + 1).toString().padStart(2, '0')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <span className="block text-[7.5px] font-black text-blue-400 uppercase truncate px-0.5">
                      {result.player1?.name?.split(' ')[0]}
                    </span>
                    <input
                      type="number"
                      value={frame.player1Score ?? ''}
                      onChange={(e) => handleFrameChange(idx, 'player1Score', e.target.value)}
                      placeholder="Pts"
                      className="w-full p-1.5 bg-blue-50/50 border-none rounded-lg text-center text-xs font-black text-[#132F45]"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="block text-[7.5px] font-black text-[#BA995D] uppercase truncate text-right px-0.5">
                      {result.player2?.name?.split(' ')[0]}
                    </span>
                    <input
                      type="number"
                      value={frame.player2Score ?? ''}
                      onChange={(e) => handleFrameChange(idx, 'player2Score', e.target.value)}
                      placeholder="Pts"
                      className="w-full p-1.5 bg-[#FDF2D1]/50 border-none rounded-lg text-center text-xs font-black text-[#BA995D]"
                    />
                  </div>
                </div>
                {isPooker && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-50">
                    <div className="space-y-1">
                      <span className="block text-[6.5px] font-black text-blue-300 uppercase px-0.5">Balls</span>
                      <input
                        type="number"
                        value={frame.player1BallsPotted ?? ''}
                        onChange={(e) => handleFrameChange(idx, 'player1BallsPotted', e.target.value)}
                        className="w-full p-1.5 bg-white border border-gray-100 rounded-md text-center text-[9px] font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="block text-[6.5px] font-black text-[#BA995D]/40 uppercase text-right px-0.5">Balls</span>
                      <input
                        type="number"
                        value={frame.player2BallsPotted ?? ''}
                        onChange={(e) => handleFrameChange(idx, 'player2BallsPotted', e.target.value)}
                        className="w-full p-1.5 bg-white border border-gray-100 rounded-md text-center text-[9px] font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}