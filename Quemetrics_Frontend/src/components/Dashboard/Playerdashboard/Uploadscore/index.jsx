// import React, { useState, useEffect, useMemo } from 'react';
// import { useNavigate } from 'react-router-dom';
// import {
//   FaBullseye, FaCircle, FaDice, FaClipboard, FaCheckCircle,
//   FaChevronRight, FaChevronLeft, FaFileUpload, FaSave, FaTimes,
//   FaTrophy
// } from 'react-icons/fa';
// import Button from '../../../ui/Button';
// import Card from '../../../ui/Card';
// import Loader from '../../../ui/Loader';
// import matchResultService from '../../../../Services/matchResultService';
// import { useNotification } from '../../../../contexts/NotificationContext';
// import LeagueRulesCard from './LeagueRulesCard';
// import { usePlayerSportBooking } from '../player-flow/PlayerSportBookingContext';
// import SportTabs from '../player-flow/SportTabs';
// import TournamentDropdown from '../player-flow/TournamentDropdown';
// import ScoreTable from '../player-flow/ScoreTable';
// import { normalizeSport } from '../player-flow/sportUtils';

// export default function UploadScore() {
//   const navigate = useNavigate();
//   const { showToast } = useNotification();

//   const [currentStep, setCurrentStep] = useState(1);
//   const [loading, setLoading] = useState(false);
//   const [loadingGames, setLoadingGames] = useState(true);
//   const [loadingContexts, setLoadingContexts] = useState(false);
//   const [loadingBookings, setLoadingBookings] = useState(false);
//   const [games, setGames] = useState([]);
//   const [leagues, setLeagues] = useState([]);
//   const [tournaments, setTournaments] = useState([]);
//   const [bookings, setBookings] = useState([]);
//   const [selectedMatch, setSelectedMatch] = useState(null);
//   const [matchDetails, setMatchDetails] = useState(null);

//   const [formData, setFormData] = useState({
//     gameId: '',
//     contextType: 'league', // 'league' or 'tournament'
//     contextId: '',
//     bookingId: '',
//     isWalkover: false, // NEW: Track if this is a walkover
//     walkoverWinner: null, // NEW: Who won by walkover
//     winnerId: null, // NEW: For tie-breaks (e.g. re-spotted black winner)
//     player1Score: '',
//     player2Score: '',
//     frameScores: [], // Detail scores for snooker/pool
//     notes: '',
//     resultImage: null,
//     tieBreakMethod: 'deciding_frame'
//   });

//   const [previewImage, setPreviewImage] = useState(null);

//   // Fetch games on mount
//   useEffect(() => {
//     const fetchGames = async () => {
//       setLoadingGames(true);
//       try {
//         const data = await matchResultService.getAvailableGames();
//         // Check which games have bookings and add counters
//         const gamesWithBookings = await Promise.all(
//           (data.data || []).map(async (game, index) => {
//             try {
//               // Check leagues for this game
//               const leagueData = await matchResultService.getLeaguesByGame(game.id);
//               const leaguesWithBookings = await Promise.all(
//                 (leagueData.data || []).map(async (league) => {
// try {
//   const bookingsData = await matchResultService.getLeagueBookings(league.id);
//   return { ...league, matchCount: (bookingsData.data || []).length };
// } catch (e) {
//   return { ...league, matchCount: 0 };
// }
//                 })
//               );

//               // Check tournaments for this game
//               const tournamentData = await matchResultService.getTournamentsByGame(game.id);
//               const tournamentsWithBookings = await Promise.all(
//                 (tournamentData.data || []).map(async (tournament) => {
// try {
//   const bookingsData = await matchResultService.getTournamentBookings(tournament.id);
//   return { ...tournament, matchCount: (bookingsData.data || []).length };
// } catch (e) {
//   return { ...tournament, matchCount: 0 };
// }
//                 })
//               );

//               const totalBookings = leaguesWithBookings.reduce((sum, l) => sum + l.matchCount, 0) +
//                                    tournamentsWithBookings.reduce((sum, t) => sum + t.matchCount, 0);

//               return {
//                 ...game,
//                 hasBookings: totalBookings > 0,
//                 bookingCount: totalBookings
//               };
// } catch (e) {
//               return {
//                 ...game,
//                 hasBookings: false,
//                 bookingCount: 0
//               };
// }
//           })
//         );

//         setGames(gamesWithBookings);
//       } catch (error) {
//         showToast('Failed to fetch games', 'error');
//       } finally {
//         setLoadingGames(false);
//       }
//     };
//     fetchGames();
//   }, []);

//   // Fetch leagues/tournaments when game changes
//   useEffect(() => {
//     if (formData.gameId) {
//       const fetchData = async () => {
//         setLoadingContexts(true);
//         try {
//           if (formData.contextType === 'league') {
//             const data = await matchResultService.getLeaguesByGame(formData.gameId);
//             const leaguesWithMatchCount = await Promise.all(
//               (data.data || []).map(async (league) => {
// try {
//   const bookingsData = await matchResultService.getLeagueBookings(league.id);
//   return { ...league, matchCount: (bookingsData.data || []).length };
// } catch (e) {
//   return { ...league, matchCount: 0 };
// }
//               })
//             );
//             // Only keep leagues that actually have confirmed bookings available
//             setLeagues(leaguesWithMatchCount.filter(l => l.matchCount > 0));
//           } else {
//             const data = await matchResultService.getTournamentsByGame(formData.gameId);
//             const tournamentsWithMatchCount = await Promise.all(
//               (data.data || []).map(async (tournament) => {
// try {
//   const parsed = JSON.parse(club.games);
//   if (Array.isArray(parsed)) gamesArray = parsed.map(g => (typeof g === 'string' ? g : g.name || g.id));
// } catch (e) {
//   gamesArray = club.games.split(',').map(s => s.trim());
// }
//               })
//             );
//             // Only keep tournaments that actually have confirmed bookings available
//             setTournaments(tournamentsWithMatchCount.filter(t => t.matchCount > 0));
//           }
//         } catch (error) {
//           showToast(`Failed to fetch ${formData.contextType}s`, 'error');
//         } finally {
//           setLoadingContexts(false);
//         }
//       };
//       fetchData();
//     }
//   }, [formData.gameId, formData.contextType]);

//   // Fetch bookings when contextId changes
//   useEffect(() => {
//     if (formData.contextId) {
//       const fetchBookings = async () => {
//         setLoadingBookings(true);
//         try {
//           let data;
//           if (formData.contextType === 'league') {
//             data = await matchResultService.getLeagueBookings(formData.contextId);
//           } else {
//             data = await matchResultService.getTournamentBookings(formData.contextId);
//           }
//           setBookings(data.data || []);
//         } catch (error) {
//           showToast('Failed to fetch bookings', 'error');
//         } finally {
//           setLoadingBookings(false);
//         }
//       };
//       fetchBookings();
//     }
//   }, [formData.contextId, formData.contextType]);

//   // Fetch match details when bookingId changes
//   useEffect(() => {
//     if (formData.bookingId) {
//       const fetchDetails = async () => {
//         try {
//           const data = await matchResultService.getBookingDetails(formData.bookingId);
//           const details = data.data;
//           setMatchDetails(details);

//           // Initialize frameScores if the league requires detailed scoring
//           if (details.matchConfig?.scoreDetail === 'frame_by_frame') {
//             const totalFrames = details.matchConfig.totalFrames || 0;
//             const initialFrames = Array.from({ length: totalFrames }, (_, i) => ({
//               frameNumber: i + 1,
//               player1Score: '',
//               player2Score: '',
//               player1Break: '',
//               player2Break: '',
//               player1BallsPotted: '',
//               player2BallsPotted: '',
//               isBlackFinish: false,
//               isWhitewash: false,
//               isSevenBallWin: false,
//               winnerId: null
//             }));
//             setFormData(prev => ({ ...prev, frameScores: initialFrames }));
//           }
//         } catch (error) {
//           showToast('Failed to fetch match details', 'error');
//         }
//       };
//       fetchDetails();
//     }
//   }, [formData.bookingId]);

//   const isDigitsOnly = (value) => value === '' || /^[0-9]+$/.test(value);
//   const normalizeNumericInput = (value) => {
//     if (value === '' || value == null) return '';
//     const digits = String(value).replace(/\D+/g, '');
//     return digits;
//   };
//   const handleInputChange = (field, value) => {
//     setFormData(prev => ({ ...prev, [field]: value }));
//   };
//   const handleNumericInputChange = (field, value) => {
//     handleInputChange(field, normalizeNumericInput(value));
//   };
//   const allowNumericKey = (e) => {
//     const allowedKeys = ['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Home', 'End'];
//     if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;
//     if (!/^[0-9]$/.test(e.key)) {
//       e.preventDefault();
//     }
//   };

//   const updateFrameScore = (index, field, value) => {
//     const newFrames = [...formData.frameScores];
//     const numericFields = ['player1Score', 'player2Score', 'player1Break', 'player2Break', 'player1BallsPotted', 'player2BallsPotted'];
//     const sanitizedValue = numericFields.includes(field) ? normalizeNumericInput(value) : value;
//     newFrames[index][field] = sanitizedValue;

//     // Auto-calculate player scores
//     let p1Wins = 0;
//     let p2Wins = 0;

//     newFrames.forEach(f => {
//       const s1 = parseInt(f.player1Score) || 0;
//       const s2 = parseInt(f.player2Score) || 0;
//       if (s1 > s2) p1Wins++;
//       else if (s2 > s1) p2Wins++;
//     });

//     setFormData(prev => ({
//       ...prev,
//       frameScores: newFrames,
//       player1Score: p1Wins.toString(),
//       player2Score: p2Wins.toString()
//     }));
//   };

//   const handleImageChange = (e) => {
//     const file = e.target.files[0];
//     if (file) {
//       setFormData(prev => ({ ...prev, resultImage: file }));
//       const reader = new FileReader();
//       reader.onloadend = () => setPreviewImage(reader.result);
//       reader.readAsDataURL(file);
//     }
//   };

//   const nextStep = () => setCurrentStep(prev => prev + 1);
//   const prevStep = () => setCurrentStep(prev => prev - 1);

//   const handleSubmit = async () => {
//     let isValid = false;

//     if (formData.isWalkover) {
//       // For walkover, just need to know the winner
//       if (!formData.walkoverWinner) {
//         showToast('Please select the walkover winner', 'warning');
//         return;
//       }
//       isValid = true;
//     } else {
//       // For normal score, need both scores — treat numeric 0 as valid
//       isValid = true;
//     }

//     // Check if photo proof is required by league configuration
//     const reportingConfig = matchDetails?.league?.reporting || matchDetails?.booking?.league?.reporting;
//     const isPhotoProofRequired = reportingConfig?.photoProof === true;

//     if (isPhotoProofRequired && !formData.isWalkover && !formData.resultImage) {
//       showToast('Photo proof is required for this league. Please upload a match image.', 'warning');
//       return;
//     }

//     if (!isValid) return;

//     setLoading(true);
//     try {
//       const submissionData = new FormData();
//       submissionData.append('bookingId', formData.bookingId);
//       const sport = matchDetails.sport || matchDetails.booking?.sport || matchDetails.league?.sport;
//       submissionData.append('sport', sport);

//       // Handle walkover
//       if (formData.isWalkover) {
//         submissionData.append('isWalkover', 'true');
//         submissionData.append('walkoverWinner', formData.walkoverWinner);
//         submissionData.append('notes', formData.notes || 'No-show walkover');
//       } else {
//         // Depending on sport, set the right fields
//         if (sport === 'snooker' || sport === 'pooker') {
//           submissionData.append('player1Frames', formData.player1Score);
//           submissionData.append('player2Frames', formData.player2Score);
//         } else if (sport === 'pool') {
//           submissionData.append('player1RackWins', formData.player1Score);
//           submissionData.append('player2RackWins', formData.player2Score);
//         }

//         submissionData.append('notes', formData.notes);
//         if (formData.resultImage) {
//           submissionData.append('resultImage', formData.resultImage);
//         }

//         // Add frame scores if detail level is frame_by_frame
//         if (matchDetails.matchConfig?.scoreDetail === 'frame_by_frame') {
//           // Filter out frames that haven't been played if it's best of (early win)
//           const playedFrames = formData.frameScores.filter(f => f.player1Score !== '' || f.player2Score !== '');
//           submissionData.append('frameScores', JSON.stringify(playedFrames));
//         }

//         // Add winnerId and tieBreakMethod if it's a tie-break winner
//         if (formData.winnerId) {
//           submissionData.append('winnerId', formData.winnerId);
//           submissionData.append('tieBreakMethod', formData.tieBreakMethod);
//         }
//       }

//       await matchResultService.submitMatchResult(submissionData);
//       showToast('Match result submitted successfully!', 'success');
//       navigate('/player/results');
//     } catch (error) {
//       showToast(error.message || 'Failed to submit result', 'error');
//     } finally {
//       setLoading(false);
//     }
//   };

//   const renderStep = () => {
//     // Get config from matchDetails if available
//     const config = matchDetails?.matchConfig;
//     const matchRules = (() => {
//       if (!config?.matchRules) return {};
//       try {
//         return typeof config.matchRules === 'string' ? JSON.parse(config.matchRules) : config.matchRules;
//       } catch (e) { return {}; }
//     })();
//     const isDraw = parseInt(formData.player1Score) === parseInt(formData.player2Score) && formData.player1Score !== '' && formData.player2Score !== '';
//     const noDrawRequired = (matchRules.noDrawRule && matchRules.noDrawRule !== 'none') || matchRules.allowDraw === false;

//     switch (currentStep) {
//       case 1: // Select Game
//         if (loadingGames) {
//           return (
//             <div className="space-y-4">
//               <div>
//                 <h2 className="text-lg font-black text-gray-900">Select Sport</h2>
//                 <p className="text-sm text-gray-400 mt-0.5">Choose the sport you played</p>
//               </div>
//               <div className="flex flex-col items-center justify-center py-12">
//                 <div className="w-10 h-10 border-2 border-[#132F45] border-t-transparent rounded-full animate-spin" />
//                 <p className="mt-3 text-gray-400 text-sm font-medium">Loading available sports…</p>
//               </div>
//             </div>
//           );
//         }

//         if (games.length === 0) {
//           return (
//             <div className="space-y-4">
//               <div>
//                 <h2 className="text-lg font-black text-gray-900">Select Sport</h2>
//                 <p className="text-sm text-gray-400 mt-0.5">Choose the sport you played</p>
//               </div>
//               <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
//                 <FaClipboard className="text-4xl text-gray-200 mx-auto mb-3" />
//                 <p className="text-gray-600 font-bold">No matches to report</p>
//                 <p className="text-sm text-gray-400 mt-1">You have no pending scheduled matches.</p>
//               </div>
//             </div>
//           );
//         }

//         return (
//           <div className="space-y-5">
//             <div>
//               <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em]">Select Sport</h2>
//               <p className="text-[8px] font-black text-gray-400 mt-1 uppercase tracking-widest">Which sport did you play?</p>
//             </div>
//             <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
//               {games.map(game => {
//                 const isActive = formData.gameId === game.id;
//                 const iconMap = { Snooker: <FaBullseye />, Pool: <FaCircle />, Pooker: <FaDice />, Poker: <FaDice /> };
//                 return (
//                   <button
//                     key={game.id}
//                     onClick={() => { if (game.hasBookings) { handleInputChange('gameId', game.id); nextStep(); } }}
//                     disabled={!game.hasBookings}
//                     className={`group relative rounded-xl border overflow-hidden transition-all text-left ${
//                       !game.hasBookings ? 'cursor-not-allowed opacity-40 border-gray-50 bg-white' :
//                       isActive ? 'border-[#BA995D] bg-[#132F45] shadow-xl shadow-[#132F45]/20' :
//                       'border-gray-50 bg-white hover:border-[#FDF2D1] hover:-translate-y-0.5 hover:shadow-lg shadow-sm cursor-pointer'
//                     }`}
//                   >
//                     <div className="p-5">
//                       <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 text-base transition-all ${
//                         isActive ? 'bg-[#BA995D] text-white' : 'bg-[#FAFAFA] text-[#132F45] group-hover:bg-[#132F45] group-hover:text-[#BA995D]'
//                       }`}>
//                         {iconMap[game.name] || <FaBullseye />}
//                       </div>
//                       <p className={`font-black text-xs uppercase tracking-widest ${isActive ? 'text-white' : 'text-[#132F45]'}`}>{game.name}</p>
//                       <p className={`text-[8px] font-black uppercase tracking-widest mt-1 ${
//                         isActive ? 'text-[#BA995D]' : game.hasBookings ? 'text-gray-400' : 'text-gray-300'
//                       }`}>
//                         {game.hasBookings ? `${game.bookingCount} pending` : 'No matches'}
//                       </p>
//                     </div>
//                     {game.hasBookings && (
//                       <div className={`absolute top-3 right-3 w-4 h-4 rounded-full flex items-center justify-center ${
//                         isActive ? 'bg-[#BA995D]' : 'bg-[#FAFAFA]'
//                       }`}>
//                         <FaChevronRight className={`text-[6px] ${isActive ? 'text-white' : 'text-gray-400'}`} />
//                       </div>
//                     )}
//                   </button>
//                 );
//               })}
//             </div>
//           </div>
//         );

//       case 2: // Select Context (League/Tournament)
//         return (
//           <div className="space-y-4">
//             <div className="flex items-center justify-between">
//               <div>
//                 <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em]">Match Type</h2>
//                 <p className="text-[8px] font-black text-gray-400 mt-1 uppercase tracking-widest">What kind of match was it?</p>
//               </div>
//             </div>
//             <div className="flex gap-1.5 p-1 bg-[#FAFAFA] border border-gray-100 rounded-xl w-fit">
//               {['league','tournament'].map(t => (
//                 <button key={t} onClick={() => handleInputChange('contextType', t)}
//                   className={`px-4 py-1.5 rounded-lg text-[8px] font-black transition-all capitalize uppercase tracking-widest ${
//                     formData.contextType === t ? 'bg-[#132F45] text-white shadow-md' : 'text-gray-400 hover:text-[#132F45]'
//                   }`}>{t}s</button>
//               ))}
//             </div>

//             {loadingContexts ? (
//               <div className="py-8 flex flex-col items-center justify-center gap-3">
//                 <div className="w-7 h-7 rounded-full border-2 border-gray-100 border-t-[#BA995D] animate-spin" />
//                 <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Loading {formData.contextType}s...</span>
//               </div>
//             ) : (
//               <div className="space-y-2">
//                 {(formData.contextType === 'league' ? leagues : tournaments).length > 0 ?
//                   (formData.contextType === 'league' ? leagues : tournaments).map(item => (
//                     <button key={item.id}
//                       onClick={() => { handleInputChange('contextId', item.id); nextStep(); }}
//                       className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all group ${
//                         formData.contextId === item.id
//                           ? 'border-[#BA995D] bg-[#132F45] text-white'
//                           : 'border-gray-50 hover:border-[#FDF2D1] bg-white'
//                       }`}>
//                       <div>
//                         <p className={`font-black text-[10px] uppercase tracking-tight ${formData.contextId === item.id ? 'text-white' : 'text-[#132F45]'}`}>{item.name}</p>
//                         <p className={`text-[8px] font-black mt-0.5 uppercase tracking-widest ${formData.contextId === item.id ? 'text-white/40' : 'text-gray-400'}`}>{item.organization?.name || item.venue?.name || ''}</p>
//                       </div>
//                       <div className="flex items-center gap-3">
//                         <span className={`text-[8px] font-black px-2.5 py-1 rounded-full ${
//                           formData.contextId === item.id ? 'bg-[#BA995D] text-white' : 'bg-[#FAFAFA] text-[#132F45]'
//                         }`}>
//                           {item.matchCount} left
//                         </span>
//                         <FaChevronRight className={`text-[9px] group-hover:translate-x-0.5 transition-transform ${formData.contextId === item.id ? 'text-[#BA995D]' : 'text-gray-300'}`} />
//                       </div>
//                     </button>
//                   )) : (
//                   <div className="text-center py-10 bg-[#FAFAFA] rounded-xl border border-dashed border-gray-100">
//                     <FaTrophy className="text-2xl text-gray-200 mx-auto mb-2" />
//                     <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">No {formData.contextType}s found</p>
//                   </div>
//                 )}
//               </div>
//             )}
//             <div className="pt-2 flex justify-start">
//               <button onClick={prevStep} className="group flex items-center gap-2 text-[8px] font-black text-gray-400 uppercase tracking-widest hover:text-[#132F45] transition-colors">
//                 <div className="w-6 h-6 rounded-full border border-gray-100 flex items-center justify-center group-hover:border-[#BA995D] transition-colors">
//                   <FaChevronLeft className="text-[8px]" />
//                 </div>
//                 Back
//               </button>
//             </div>
//           </div>
//         );

//       case 3: // Select Match
//         if (loadingBookings) {
//           return (
//             <div className="space-y-4">
//               <div>
//                 <h2 className="text-lg font-black text-gray-900">Select Match</h2>
//                 <p className="text-sm text-gray-400 mt-0.5">Choose the match to report</p>
//               </div>
//               <div className="flex flex-col items-center justify-center py-12">
//                 <div className="w-8 h-8 border-2 border-[#132F45] border-t-transparent rounded-full animate-spin" />
//                 <p className="mt-3 text-gray-400 text-sm font-medium">Loading matches…</p>
//               </div>
//             </div>
//           );
//         }

//         if (bookings.length === 0) {
//           return (
//             <div className="space-y-4">
//               <div>
//                 <h2 className="text-lg font-black text-gray-900">Select Match</h2>
//                 <p className="text-sm text-gray-400 mt-0.5">Choose the match to report</p>
//               </div>
//               <div className="text-center py-14 bg-gray-50 rounded-xl border border-dashed border-gray-200">
//                 <FaClipboard className="text-3xl text-gray-200 mx-auto mb-3" />
//                 <p className="text-gray-600 font-bold text-sm">No pending matches</p>
//                 <p className="text-xs text-gray-400 mt-1">No unscored matches found for this {formData.contextType}.</p>
//               </div>
//               <div className="pt-2">
//                 <button onClick={prevStep} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 font-semibold">
//                   <FaChevronLeft className="text-[10px]" /> Back
//                 </button>
//               </div>
//             </div>
//           );
//         }

//         return (
//           <div className="space-y-4">
//             <div>
//               <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em]">Select Match</h2>
//               <p className="text-[8px] font-black text-gray-400 mt-1 uppercase tracking-widest">{bookings.length} booking{bookings.length !== 1 ? 's' : ''} pending report</p>
//             </div>
//             <div className="space-y-2">
//               {bookings.map(booking => (
//                 <button
//                   key={booking.id}
//                   onClick={async () => {
//                     handleInputChange('bookingId', booking.id);
//                     try {
//                       const details = await matchResultService.getBookingDetails(booking.id);
//                       setMatchDetails(details.data);
//                       handleInputChange('isWalkover', false);
//                       handleInputChange('walkoverWinner', null);
//                       handleInputChange('winnerId', null);
//                       handleInputChange('player1Score', '');
//                       handleInputChange('player2Score', '');
//                       nextStep();
//                     } catch (error) {
//                       showToast('Failed to load match details', 'error');
//                     }
//                   }}
//                   className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all group ${
//                     formData.bookingId === booking.id
//                       ? 'border-[#BA995D] bg-[#132F45]'
//                       : 'border-gray-50 bg-white hover:border-[#FDF2D1] hover:shadow-md shadow-sm'
//                   }`}
//                 >
//                   <div className="flex items-center gap-3 min-w-0">
//                     <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[8px] font-black shrink-0 ${
//                       formData.bookingId === booking.id ? 'bg-[#BA995D] text-white' : 'bg-[#FAFAFA] text-[#132F45]'
//                     }`}>VS</div>
//                     <div className="min-w-0">
//                       <p className={`font-black text-[10px] uppercase tracking-tight truncate ${
//                         formData.bookingId === booking.id ? 'text-white' : 'text-[#132F45]'
//                       }`}>
//                         {booking.player?.name || 'Player 1'}
//                         <span className={`font-black mx-1.5 ${
//                           formData.bookingId === booking.id ? 'text-[#BA995D]' : 'text-gray-300'
//                         }`}>vs</span>
//                         {booking.opponent?.name || 'Player 2'}
//                       </p>
//                       <p className={`text-[7.5px] font-black mt-0.5 uppercase tracking-widest truncate ${
//                         formData.bookingId === booking.id ? 'text-white/40' : 'text-gray-400'
//                       }`}>
//                         {booking.bookingDate ? (() => {
//                           // Parse date string (YYYY-MM-DD) to avoid timezone issues
//                           const dateParts = booking.bookingDate.split('T')[0].split('-');
//                           const day = String(parseInt(dateParts[2])).padStart(2, '0');
//                           const monthIndex = parseInt(dateParts[1]) - 1;
//                           const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthIndex];
//                           return `${day} ${month}`;
//                         })() : 'TBD'}
//                         {booking.venue?.name ? ` · ${booking.venue.name}` : ''}
//                         {booking.fixture?.round ? ` · Rnd ${booking.fixture.round}` : ''}
//                       </p>
//                     </div>
//                   </div>
//                   <FaChevronRight className={`text-[9px] flex-shrink-0 ml-3 group-hover:translate-x-0.5 transition-transform ${
//                     formData.bookingId === booking.id ? 'text-[#BA995D]' : 'text-gray-300'
//                   }`} />
//                 </button>
//               ))}
//             </div>
//             <div className="pt-2">
//               <button onClick={prevStep} className="group flex items-center gap-2 text-[8px] font-black text-gray-400 uppercase tracking-widest hover:text-[#132F45] transition-colors">
//                 <div className="w-6 h-6 rounded-full border border-gray-100 flex items-center justify-center group-hover:border-[#BA995D] transition-colors">
//                   <FaChevronLeft className="text-[8px]" />
//                 </div>
//                 Back
//               </button>
//             </div>
//           </div>
//         );

//       case 4: // Walkover or Regular Score Selection
//         if (!matchDetails) return (
//           <div className="flex items-center justify-center py-12">
//             <div className="w-8 h-8 border-2 border-[#132F45] border-t-transparent rounded-full animate-spin" />
//           </div>
//         );
//         return (
//           <div className="space-y-5">
//             <div>
//               <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em]">Match Result</h2>
//               <p className="text-[8px] font-black text-gray-400 mt-1 uppercase tracking-widest">Did both players play the match?</p>
//             </div>

//             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
//               <button
//                 onClick={() => { handleInputChange('isWalkover', false); nextStep(); }}
//                 className={`p-5 rounded-xl border-2 text-left transition-all group ${
//                   !formData.isWalkover ? 'border-[#BA995D] bg-[#132F45]' : 'border-gray-50 bg-white hover:border-[#FDF2D1]'
//                 }`}
//               >
//                 <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 transition-all ${
//                   !formData.isWalkover ? 'bg-[#BA995D]' : 'bg-[#FAFAFA] group-hover:bg-[#132F45]'
//                 }`}>
//                   <FaCheckCircle className={`text-sm ${
//                     !formData.isWalkover ? 'text-white' : 'text-[#132F45] group-hover:text-[#BA995D]'
//                   }`} />
//                 </div>
//                 <h3 className={`font-black text-[10px] uppercase tracking-widest ${
//                   !formData.isWalkover ? 'text-white' : 'text-[#132F45]'
//                 }`}>Played Match</h3>
//                 <p className={`text-[8px] font-black mt-1.5 uppercase tracking-widest leading-relaxed ${
//                   !formData.isWalkover ? 'text-white/40' : 'text-gray-400'
//                 }`}>Both players played the match</p>
//               </button>

//               <button
//                 onClick={() => { handleInputChange('isWalkover', true); nextStep(); }}
//                 className={`p-5 rounded-xl border-2 text-left transition-all group ${
//                   formData.isWalkover ? 'border-red-500 bg-red-600' : 'border-gray-50 bg-white hover:border-red-100'
//                 }`}
//               >
//                 <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 transition-all ${
//                   formData.isWalkover ? 'bg-red-500' : 'bg-[#FAFAFA] group-hover:bg-red-50'
//                 }`}>
//                   <FaTimes className={`text-sm ${
//                     formData.isWalkover ? 'text-white' : 'text-red-400'
//                   }`} />
//                 </div>
//                 <h3 className={`font-black text-[10px] uppercase tracking-widest ${
//                   formData.isWalkover ? 'text-white' : 'text-[#132F45]'
//                 }`}>No-Show / Walkover</h3>
//                 <p className={`text-[8px] font-black mt-1.5 uppercase tracking-widest leading-relaxed ${
//                   formData.isWalkover ? 'text-white/50' : 'text-gray-400'
//                 }`}>One player did not show up</p>
//               </button>
//             </div>

//             <div className="pt-1">
//               <button onClick={prevStep} className="group flex items-center gap-2 text-[8px] font-black text-gray-400 uppercase tracking-widest hover:text-[#132F45] transition-colors">
//                 <div className="w-6 h-6 rounded-full border border-gray-100 flex items-center justify-center group-hover:border-[#BA995D] transition-colors">
//                   <FaChevronLeft className="text-[8px]" />
//                 </div>
//                 Back
//               </button>
//             </div>
//           </div>
//         );

//       case 5: // Enter Score or Walkover Winner Selection
//         if (!matchDetails) return (
//           <div className="py-8 flex flex-col items-center justify-center gap-3">
//             <div className="w-7 h-7 rounded-full border-2 border-gray-100 border-t-[#BA995D] animate-spin" />
//             <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Loading match data...</span>
//           </div>
//         );

//         // If this is a walkover, show winner selection
//         if (formData.isWalkover) {
//           return (
//             <div className="space-y-5">
//               <div className="text-center">
//                 <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-widest">Walkover Winner</h2>
//                 <p className="text-[8px] font-black text-gray-400 mt-1 uppercase tracking-widest">Which player wins the walkover?</p>
//               </div>

//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                 <button
//                   onClick={() => handleInputChange('walkoverWinner', matchDetails.player1.id)}
//                   className={`p-5 rounded-xl border-2 transition-all text-center flex flex-col items-center gap-3 ${
//                     formData.walkoverWinner === matchDetails.player1.id
//                       ? 'border-[#BA995D] bg-[#132F45] shadow-xl shadow-[#132F45]/20'
//                       : 'border-gray-50 bg-white hover:border-[#FDF2D1] hover:shadow-md'
//                   }`}
//                 >
//                   <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black transition-all ${
//                     formData.walkoverWinner === matchDetails.player1.id ? 'bg-[#BA995D] text-white' : 'bg-[#FAFAFA] text-[#132F45]'
//                   }`}>
//                     {matchDetails.player1?.name?.charAt(0) || 'P1'}
//                   </div>
//                   <div className="space-y-1">
//                     <h3 className={`text-[10px] font-black uppercase tracking-widest ${
//                       formData.walkoverWinner === matchDetails.player1.id ? 'text-white' : 'text-[#132F45]'
//                     }`}>{matchDetails.player1?.name || 'Player 1'}</h3>
//                     <p className={`text-[8px] font-black uppercase tracking-widest ${
//                       formData.walkoverWinner === matchDetails.player1.id ? 'text-[#BA995D]' : 'text-gray-400'
//                     }`}>Wins Walkover</p>
//                   </div>
//                 </button>

//                 <button
//                   onClick={() => handleInputChange('walkoverWinner', matchDetails.player2.id)}
//                   className={`p-5 rounded-xl border-2 transition-all text-center flex flex-col items-center gap-3 ${
//                     formData.walkoverWinner === matchDetails.player2.id
//                       ? 'border-[#BA995D] bg-[#132F45] shadow-xl shadow-[#132F45]/20'
//                       : 'border-gray-50 bg-white hover:border-[#FDF2D1] hover:shadow-md'
//                   }`}
//                 >
//                   <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black transition-all ${
//                     formData.walkoverWinner === matchDetails.player2.id ? 'bg-[#BA995D] text-white' : 'bg-[#FAFAFA] text-[#132F45]'
//                   }`}>
//                     {matchDetails.player2?.name?.charAt(0) || 'P2'}
//                   </div>
//                   <div className="space-y-1">
//                     <h3 className={`text-[10px] font-black uppercase tracking-widest ${
//                       formData.walkoverWinner === matchDetails.player2.id ? 'text-white' : 'text-[#132F45]'
//                     }`}>{matchDetails.player2?.name || 'Player 2'}</h3>
//                     <p className={`text-[8px] font-black uppercase tracking-widest ${
//                       formData.walkoverWinner === matchDetails.player2.id ? 'text-[#BA995D]' : 'text-gray-400'
//                     }`}>Wins Walkover</p>
//                   </div>
//                 </button>
//                </div>

//               <div>
//                 <label className="block text-[8px] font-black text-gray-400 mb-2 uppercase tracking-widest">Walkover Reason (Optional)</label>
//                 <textarea
//                   value={formData.notes}
//                   onChange={(e) => handleInputChange('notes', e.target.value)}
//                   placeholder="e.g., Player did not show up, withdrew..."
//                   className="w-full border-2 border-gray-50 rounded-xl p-3.5 text-[10px] font-medium focus:border-[#BA995D] focus:outline-none bg-[#FAFAFA] placeholder:text-gray-300 resize-none"
//                   rows="2"
//                 />
//               </div>

//               <div className="flex justify-between pt-4 border-t border-gray-50">
//                 <button onClick={prevStep} className="group flex items-center gap-2 text-[8px] font-black text-gray-400 uppercase tracking-widest hover:text-[#132F45] transition-colors">
//                   <div className="w-6 h-6 rounded-full border border-gray-100 flex items-center justify-center group-hover:border-[#BA995D] transition-colors">
//                     <FaChevronLeft className="text-[8px]" />
//                   </div>
//                   Back
//                 </button>
//                 <button
//                   onClick={() => formData.walkoverWinner ? nextStep() : showToast('Please select the winner', 'warning')}
//                   className={`px-8 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-xl flex items-center gap-3 ${
//                     formData.walkoverWinner
//                       ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-500/20'
//                       : 'bg-gray-100 text-gray-300 shadow-none cursor-not-allowed'
//                   }`}
//                 >
//                   Submit Walkover <FaChevronRight className="text-[8px]" />
//                 </button>
//               </div>
//             </div>
//           );
//         }

//         // Regular score entry form
//         const validateStep4 = () => {
//           // In Total Upload Score mode (scoreDetail: 'points'), players submit raw totals
//           const isTotalUploadScore = config?.scoreDetail === 'points';

//           // Require both scores — but treat 0 as a valid score (use strict empty-string check)
//           const p1Empty = formData.player1Score === '' || formData.player1Score === null || formData.player1Score === undefined;
//           const p2Empty = formData.player2Score === '' || formData.player2Score === null || formData.player2Score === undefined;
//           if (p1Empty || p2Empty) {
//             showToast('Please enter both scores', 'warning');
//             return false;
//           }

//           if ((config?.isBestOf || config?.isRaceTo) && !isTotalUploadScore) {
//             const p1 = parseInt(formData.player1Score);
//             const p2 = parseInt(formData.player2Score);
//             const framesToWin = config.framesToWin;
//             const totalFrames = config.totalFrames;
//             const ruleName = config.isRaceTo ? `Race to ${framesToWin}` : `Best of ${totalFrames}`;

//             // For Race to X: Neither player can have more than framesToWin
//             if (config.isRaceTo && (p1 > framesToWin || p2 > framesToWin)) {
//               showToast(`Match rule: ${ruleName}. A player cannot win more than ${framesToWin} frames.`, 'warning');
//               return false;
//             }

//             // For Best of X: Total frames played cannot exceed the maximum possible
//             if (config.isBestOf && (p1 + p2 > totalFrames)) {
//               showToast(`Match rule: ${ruleName}. Total frames (${p1 + p2}) exceeds the maximum possible (${totalFrames}).`, 'warning');
//               return false;
//             }

//             // For Best of X: Check if the match result makes sense (at least one player should have framesToWin if it's a complete match)
//             if (config.isBestOf && p1 + p2 === totalFrames && p1 < framesToWin && p2 < framesToWin) {
//               showToast(`Match rule: ${ruleName}. In a complete match, at least one player must reach ${framesToWin} wins.`, 'warning');
//               return false;
//             }

//             // For frame-by-frame scoring, validate frame consistency
//             if (config?.scoreDetail === 'frame_by_frame') {
//               const playedFrames = formData.frameScores.filter(f => f.player1Score !== '' || f.player2Score !== '');
//               const totalPlayedFrames = playedFrames.length;

//               const invalidFrame = playedFrames.find(f =>
//                 !isDigitsOnly(f.player1Score) ||
//                 !isDigitsOnly(f.player2Score) ||
//                 (matchDetails.sport === 'snooker' && (!isDigitsOnly(f.player1Break) || !isDigitsOnly(f.player2Break))) ||
//                 ((matchDetails.sport === 'pooker' || matchDetails.sport === 'pool') && (!isDigitsOnly(f.player1BallsPotted) || !isDigitsOnly(f.player2BallsPotted)))
//               );
//               if (invalidFrame) {
//                 showToast('Please use only numbers in all entered frame score fields.', 'warning');
//                 return false;
//               }

//               let calculatedP1Wins = 0;
//               let calculatedP2Wins = 0;
//               playedFrames.forEach(f => {
//                 const s1 = parseInt(f.player1Score) || 0;
//                 const s2 = parseInt(f.player2Score) || 0;
//                 if (s1 > s2) calculatedP1Wins++;
//                 else if (s2 > s1) calculatedP2Wins++;
//               });

//               if (calculatedP1Wins !== p1 || calculatedP2Wins !== p2) {
//                 showToast('Frame scores do not match the calculated totals. Please check your frame entries.', 'warning');
//                 return false;
//               }

//               if (matchDetails.sport === 'pooker') {
//                 const invalidFrames = playedFrames.filter(f => f.player1BallsPotted === '' || f.player2BallsPotted === '');
//                 if (invalidFrames.length > 0) {
//                   showToast('Balls potted data is required for each played Pooker frame.', 'warning');
//                   return false;
//                 }
//               }

//               // For Best of X, ensure we don't have more frames than possible
//               if (config.isBestOf && totalPlayedFrames > totalFrames) {
//                 showToast(`Match rule: ${ruleName}. Cannot play more than ${totalFrames} frames.`, 'warning');
//                 return false;
//               }
//             }
//           }

//           // Check Draw Resolution Rule
//           const noDrawRequiredLocal = (matchRules.noDrawRule && matchRules.noDrawRule !== 'none') || matchRules.allowDraw === false;
//           if (noDrawRequiredLocal && parseInt(formData.player1Score) === parseInt(formData.player2Score)) {
//             if (!formData.winnerId) {
//               let ruleLabel = "a tie-break winner";
//               if (matchRules.noDrawRule === 'respottedBlack') ruleLabel = "a Re-spotted Black winner";
//               else if (matchRules.noDrawRule === 'mostPoints') ruleLabel = "a Most Points winner";
//               else if (matchRules.noDrawRule === 'blackFinish') ruleLabel = "a Black Ball Finish winner";

//               showToast(`This league does not allow draws. Please specify ${ruleLabel}.`, 'warning');
//               return false;
//             }
//           }

//           return true;
//         };

//         return (
//           <div className="space-y-5">
//             <div>
//               <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em]">Enter Score</h2>
//               {(config?.isBestOf || config?.isRaceTo) && (
//                 <div className="inline-block mt-1.5 px-3 py-0.5 bg-[#FAFAFA] text-[#132F45] border border-gray-100 rounded-full text-[8px] font-black uppercase tracking-widest">
//                   {config.isRaceTo ? `Race to ${config.framesToWin}` : `Best of ${config.totalFrames}`}
//                 </div>
//               )}
//             </div>

//             <LeagueRulesCard matchDetails={matchDetails} config={config} />

//             <div className="flex items-center justify-center gap-8 md:gap-16 py-3">
//               <div className="text-center space-y-3">
//                 <div className="w-14 h-14 bg-[#132F45] rounded-2xl flex items-center justify-center text-[#BA995D] text-xl font-black mx-auto shadow-lg shadow-[#132F45]/20">
//                   {matchDetails.player1?.name?.charAt(0) || 'P1'}
//                 </div>
//                 <div className="font-black text-[9px] text-gray-400 uppercase tracking-widest truncate max-w-[90px]">{matchDetails.player1?.name || 'Player 1'}</div>
//                 <input
//                   type="number"
//                   inputMode="numeric"
//                   pattern="[0-9]*"
//                   min="0"
//                   value={formData.player1Score ?? ''}
//                   onKeyDown={allowNumericKey}
//                   onChange={(e) => handleNumericInputChange('player1Score', e.target.value)}
//                   disabled={config?.scoreDetail === 'frame_by_frame'}
//                   className={`w-16 text-center text-3xl font-black border-2 rounded-xl p-1.5 focus:border-[#BA995D] focus:outline-none transition-colors ${config?.scoreDetail === 'frame_by_frame' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-[#132F45]/30'}`}
//                   placeholder="0"
//                 />
//               </div>
//               <div className="text-lg font-black text-gray-200 uppercase tracking-[0.3em] mb-10">vs</div>
//               <div className="text-center space-y-3">
//                 <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center text-white text-xl font-black mx-auto shadow-lg shadow-red-500/20">
//                   {matchDetails.player2?.name?.charAt(0) || 'P2'}
//                 </div>
//                 <div className="font-black text-[9px] text-gray-400 uppercase tracking-widest truncate max-w-[90px]">{matchDetails.player2?.name || 'Player 2'}</div>
//                 <input
//                   type="number"
//                   inputMode="numeric"
//                   pattern="[0-9]*"
//                   min="0"
//                   value={formData.player2Score ?? ''}
//                   onKeyDown={allowNumericKey}
//                   onChange={(e) => handleNumericInputChange('player2Score', e.target.value)}
//                   disabled={config?.scoreDetail === 'frame_by_frame'}
//                   className={`w-16 text-center text-3xl font-black border-2 rounded-xl p-1.5 focus:border-[#BA995D] focus:outline-none transition-colors ${config?.scoreDetail === 'frame_by_frame' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-[#132F45]/30'}`}
//                   placeholder="0"
//                 />
//               </div>
//             </div>

//             {/* Tie-break Winner Selection */}
//             {noDrawRequired && isDraw && (
//               <div className="bg-[#132F45] border border-[#BA995D]/20 rounded-xl p-4 space-y-3">
//                 <div className="flex items-center gap-3">
//                   <div className="w-8 h-8 bg-[#BA995D] rounded-lg flex items-center justify-center">
//                     <FaTrophy className="text-white text-xs" />
//                   </div>
//                   <div>
//                     <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Draw — Tie-Break Required</h3>
//                     <p className="text-[8px] text-white/40 font-black uppercase tracking-widest">League rules require a tie-break resolution.</p>
//                   </div>
//                 </div>

//                 <div className="grid grid-cols-2 gap-2">
//                   <button
//                     onClick={() => handleInputChange('winnerId', matchDetails.player1.id)}
//                     className={`p-3 rounded-xl border-2 transition-all text-center ${
//                       formData.winnerId === matchDetails.player1.id
//                         ? 'border-[#BA995D] bg-[#BA995D]'
//                         : 'border-white/10 bg-white/5 hover:border-[#BA995D]/40'
//                     }`}
//                   >
//                     <span className={`text-[9px] font-black uppercase tracking-widest block ${
//                       formData.winnerId === matchDetails.player1.id ? 'text-white' : 'text-white/60'
//                     }`}>{matchDetails.player1?.name}</span>
//                     {formData.winnerId === matchDetails.player1.id && <FaCheckCircle className="text-white text-[10px] mx-auto mt-1" />}
//                   </button>

//                   <button
//                     onClick={() => handleInputChange('winnerId', matchDetails.player2.id)}
//                     className={`p-3 rounded-xl border-2 transition-all text-center ${
//                       formData.winnerId === matchDetails.player2.id
//                         ? 'border-[#BA995D] bg-[#BA995D]'
//                         : 'border-white/10 bg-white/5 hover:border-[#BA995D]/40'
//                     }`}
//                   >
//                     <span className={`text-[9px] font-black uppercase tracking-widest block ${
//                       formData.winnerId === matchDetails.player2.id ? 'text-white' : 'text-white/60'
//                     }`}>{matchDetails.player2?.name}</span>
//                     {formData.winnerId === matchDetails.player2.id && <FaCheckCircle className="text-white text-[10px] mx-auto mt-1" />}
//                   </button>
//                 </div>

//                 <div>
//                    <label className="block text-[8px] font-black text-white/40 uppercase tracking-widest mb-1.5">Resolution Method</label>
//                    <select
//                      value={formData.tieBreakMethod}
//                      onChange={(e) => handleInputChange('tieBreakMethod', e.target.value)}
//                      className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-[9px] font-black text-white focus:outline-none focus:border-[#BA995D]"
//                    >
//                      <option value="deciding_frame">Deciding Frame/Rack</option>
//                      <option value="highest_break">Highest Break</option>
//                      <option value="black_ball">Black Ball Shootout</option>
//                      <option value="coin_toss">Coin Toss / Luck</option>
//                      <option value="admin_decision">Admin Decision</option>
//                    </select>
//                 </div>
//               </div>
//             )}

//             {config?.scoreDetail === 'frame_by_frame' && (
//               <div className="space-y-4">
//                 <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[11px] text-blue-900 leading-relaxed">
//                   <strong>📋 Frame Breakdown:</strong> Enter each frame result below. The system will calculate totals automatically.
//                 </div>
//                 <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
//                 <table className="w-full text-sm">
//                   <thead className="bg-gray-50 font-black border-b">
//                     <tr>
//                       <th className="p-2 text-left w-12 text-[10px] uppercase tracking-wider text-gray-500">Frame</th>
//                       <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">{matchDetails.player1?.name || 'P1'}</th>
//                       <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">{matchDetails.player2?.name || 'P2'}</th>
//                       {matchDetails.sport === 'snooker' && (
//                         <>
//                           <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">P1 Break</th>
//                           <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">P2 Break</th>
//                         </>
//                       )}
//                       {matchDetails.sport === 'pooker' && (
//                         <>
//                           <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">P1 Potted</th>
//                           <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">P2 Potted</th>
//                         </>
//                       )}
//                       {matchDetails.sport === 'pool' && (
//                         <>
//                           <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">P1 Potted</th>
//                           <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">P2 Potted</th>
//                         </>
//                       )}
//                     </tr>
//                   </thead>
//                   <tbody className="divide-y">
//                     {formData.frameScores.map((frame, index) => (
//                       <tr key={frame.frameNumber} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
//                         <td className="p-2 font-black text-gray-400 text-xs">#{frame.frameNumber}</td>
//                         <td className="p-2 text-center">
//                           <input
//                             type="number"
//                             inputMode="numeric"
//                             pattern="[0-9]*"
//                             min="0"
//                             value={frame.player1Score ?? ''}
//                             onKeyDown={allowNumericKey}
//                             onChange={(e) => updateFrameScore(index, 'player1Score', e.target.value)}
//                             className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center font-black text-xs bg-white focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
//                           />
//                         </td>
//                         <td className="p-2 text-center">
//                           <input
//                             type="number"
//                             inputMode="numeric"
//                             pattern="[0-9]*"
//                             min="0"
//                             value={frame.player2Score ?? ''}
//                             onKeyDown={allowNumericKey}
//                             onChange={(e) => updateFrameScore(index, 'player2Score', e.target.value)}
//                             className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center font-black text-xs bg-white focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
//                           />
//                         </td>
//                         {matchDetails.sport === 'snooker' && (
//                           <>
//                             <td className="p-2 text-center">
//                               <input
//                                 type="number"
//                                 inputMode="numeric"
//                                 pattern="[0-9]*"
//                                 min="0"
//                                 value={frame.player1Break ?? ''}
//                                 onKeyDown={allowNumericKey}
//                                 onChange={(e) => updateFrameScore(index, 'player1Break', e.target.value)}
//                                 className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center text-[11px] font-bold text-gray-700 bg-white placeholder-gray-300 focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
//                                 placeholder="0"
//                               />
//                             </td>
//                             <td className="p-2 text-center">
//                               <input
//                                 type="number"
//                                 inputMode="numeric"
//                                 pattern="[0-9]*"
//                                 min="0"
//                                 value={frame.player2Break ?? ''}
//                                 onKeyDown={allowNumericKey}
//                                 onChange={(e) => updateFrameScore(index, 'player2Break', e.target.value)}
//                                 className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center text-[11px] font-bold text-gray-700 bg-white placeholder-gray-300 focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
//                                 placeholder="0"
//                               />
//                             </td>
//                           </>
//                         )}
//                         {matchDetails.sport === 'pooker' && (
//                           <>
//                             <td className="p-3 text-center flex flex-col items-center gap-1">
//                               <input
//                                 type="number"
//                                 inputMode="numeric"
//                                 pattern="[0-9]*"
//                                 min="0"
//                                 value={frame.player1BallsPotted ?? ''}
//                                 onKeyDown={allowNumericKey}
//                                 onChange={(e) => updateFrameScore(index, 'player1BallsPotted', e.target.value)}
//                                 className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center text-xs font-bold text-gray-700 bg-white placeholder-gray-300 focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
//                                 placeholder="Balls"
//                               />
//                               <label className="text-[10px] flex items-center gap-1 cursor-pointer">
//                                 <input
//                                   type="checkbox"
//                                   checked={frame.isBlackFinish && frame.winnerId === matchDetails.player1?.id}
//                                   onChange={(e) => {
//                                     updateFrameScore(index, 'isBlackFinish', e.target.checked);
//                                     updateFrameScore(index, 'winnerId', e.target.checked ? matchDetails.player1?.id : null);
//                                   }}
//                                 /> Black
//                               </label>
//                             </td>
//                             <td className="p-3 text-center flex-col items-center gap-1 relative">
//                               <div className="flex flex-col items-center gap-1">
//                                 <input
//                                   type="number"
//                                   inputMode="numeric"
//                                   pattern="[0-9]*"
//                                   min="0"
//                                   value={frame.player2BallsPotted ?? ''}
//                                   onKeyDown={allowNumericKey}
//                                   onChange={(e) => updateFrameScore(index, 'player2BallsPotted', e.target.value)}
//                                   className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center text-xs font-bold text-gray-700 bg-white placeholder-gray-300 focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
//                                   placeholder="Balls"
//                                 />
//                                 <label className="text-[10px] flex items-center gap-1 cursor-pointer">
//                                   <input
//                                     type="checkbox"
//                                     checked={frame.isBlackFinish && frame.winnerId === matchDetails.player2?.id}
//                                     onChange={(e) => {
//                                       updateFrameScore(index, 'isBlackFinish', e.target.checked);
//                                       updateFrameScore(index, 'winnerId', e.target.checked ? matchDetails.player2?.id : null);
//                                     }}
//                                   /> Black
//                                 </label>
//                               </div>
//                             </td>
//                           </>
//                         )}
//                         {matchDetails.sport === 'pool' && (
//                           <>
//                             <td className="p-3 text-center flex flex-col items-center gap-1">
//                               <input
//                                 type="number"
//                                 inputMode="numeric"
//                                 pattern="[0-9]*"
//                                 min="0"
//                                 value={frame.player1BallsPotted ?? ''}
//                                 onKeyDown={allowNumericKey}
//                                 onChange={(e) => updateFrameScore(index, 'player1BallsPotted', e.target.value)}
//                                 className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center text-xs font-bold text-gray-700 bg-white placeholder-gray-300 focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
//                                 placeholder="Balls"
//                               />
//                               <label className="text-[10px] flex items-center gap-1 cursor-pointer">
//                                 <input
//                                   type="checkbox"
//                                   checked={frame.isSevenBallWin && frame.winnerId === matchDetails.player1?.id}
//                                   onChange={(e) => {
//                                     updateFrameScore(index, 'isSevenBallWin', e.target.checked);
//                                     updateFrameScore(index, 'winnerId', e.target.checked ? matchDetails.player1?.id : null);
//                                   }}
//                                 /> 7-Ball
//                               </label>
//                             </td>
//                             <td className="p-3 text-center flex-col items-center gap-1 relative">
//                               <div className="flex flex-col items-center gap-1">
//                                 <input
//                                   type="number"
//                                   inputMode="numeric"
//                                   pattern="[0-9]*"
//                                   min="0"
//                                   value={frame.player2BallsPotted ?? ''}
//                                   onKeyDown={allowNumericKey}
//                                   onChange={(e) => updateFrameScore(index, 'player2BallsPotted', e.target.value)}
//                                   className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center text-xs font-bold text-gray-700 bg-white placeholder-gray-300 focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
//                                   placeholder="Balls"
//                                 />
//                                 <label className="text-[10px] flex items-center gap-1 cursor-pointer">
//                                   <input
//                                     type="checkbox"
//                                     checked={frame.isSevenBallWin && frame.winnerId === matchDetails.player2?.id}
//                                     onChange={(e) => {
//                                       updateFrameScore(index, 'isSevenBallWin', e.target.checked);
//                                       updateFrameScore(index, 'winnerId', e.target.checked ? matchDetails.player2?.id : null);
//                                     }}
//                                   /> 7-Ball
//                                 </label>
//                               </div>
//                             </td>
//                           </>
//                         )}
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//               </div>
//               </div>
//             )}
//             <div className="flex justify-between pt-6 border-t border-gray-100 mt-4">
//               <button onClick={prevStep} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-700 font-bold transition-colors">
//                 <FaChevronLeft className="text-[9px]" /> Back
//               </button>
//               <Button onClick={() => validateStep4() && nextStep()} variant="primary" className="!px-6 !py-2 !text-xs !rounded-xl">
//                 Review & Confirm <FaChevronRight className="ml-1.5 inline text-[10px]" />
//               </Button>
//             </div>
//           </div>
//         );

//       case 6: // Proof & Review
//         if (formData.isWalkover) {
//           // Walkover review
//           return (
//             <div className="space-y-6">
//               <h2 className="text-lg font-black text-gray-900 tracking-tight text-center uppercase">Confirm Walkover</h2>

//               <div className="bg-red-50/50 rounded-xl p-4 border border-red-100 space-y-3">
//                 <div className="flex justify-between items-center pb-3 border-b border-red-100/50">
//                   <span className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Result Type</span>
//                   <span className="font-black text-red-600 text-[10px] uppercase bg-red-100 px-2 py-0.5 rounded">Walkover</span>
//                 </div>
//                 <div className="flex justify-between items-center pb-3 border-b border-red-100/50">
//                   <span className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Awarded Winner</span>
//                   <span className="text-green-600 font-black text-xs uppercase">
//                     {formData.walkoverWinner === matchDetails.player1.id ? matchDetails.player1?.name : matchDetails.player2?.name}
//                   </span>
//                 </div>
//                 {formData.notes && (
//                   <div className="flex justify-between items-start pt-1">
//                     <span className="text-gray-400 text-[10px] font-black uppercase tracking-wider mt-1">Reason</span>
//                     <span className="text-gray-600 text-[11px] font-medium text-right max-w-[200px] leading-relaxed">{formData.notes}</span>
//                   </div>
//                 )}
//               </div>

//               <div className="flex justify-between pt-6 border-t border-gray-100">
//                 <button onClick={prevStep} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-700 font-bold transition-colors">
//                   <FaChevronLeft className="text-[9px]" /> Back
//                 </button>
//                 <Button
//                   onClick={handleSubmit}
//                   variant="primary"
//                   loading={loading}
//                   className="!bg-green-600 hover:!bg-green-700 text-white !px-7 !py-2.5 !rounded-xl !font-black !text-sm uppercase tracking-wider"
//                 >
//                   <FaSave className="mr-2 inline" /> Submit Walkover
//                 </Button>
//               </div>
//             </div>
//           );
//         }

//         // Regular match review
//         return (
//           <div className="space-y-6">
//             <h2 className="text-lg font-black text-gray-900 tracking-tight text-center uppercase">Match Review</h2>

//             <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-4 space-y-3">
//               <div className="flex justify-between items-center pb-3 border-b border-gray-100">
//                 <span className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Score Summary</span>
//                 <span className="font-black text-gray-900 text-xs">
//                   {matchDetails.player1?.name} {formData.player1Score} - {formData.player2Score} {matchDetails.player2?.name}
//                 </span>
//               </div>
//               <div className="flex justify-between items-center">
//                 <span className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Match Winner</span>
//                 <span className={`font-black uppercase text-[10px] px-2 py-0.5 rounded ${parseInt(formData.player1Score) === parseInt(formData.player2Score) ? 'text-amber-600 bg-amber-50' : 'text-green-600 bg-green-50'}`}>
//                   {parseInt(formData.player1Score) === parseInt(formData.player2Score)
//                     ? (formData.winnerId
//                         ? `🤝 DRAW (${formData.winnerId === matchDetails.player1.id ? matchDetails.player1?.name : matchDetails.player2?.name} won tie-break)`
//                         : '🤝 DRAW')
//                     : (parseInt(formData.player1Score) > parseInt(formData.player2Score) ? matchDetails.player1?.name : matchDetails.player2?.name)}
//                 </span>
//               </div>
//             </div>

//             {/* Frame-by-Frame Details Review */}
//             {config?.scoreDetail === 'frame_by_frame' && formData.frameScores && formData.frameScores.length > 0 && (
//               <div className="bg-blue-50 rounded-xl p-6">
//                 <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
//                   <FaClipboard className="text-blue-600" /> Frame-by-Frame Results
//                 </h3>
//                 <div className="overflow-x-auto">
//                   <table className="w-full text-sm bg-white rounded-lg overflow-hidden shadow-sm">
//                     <thead className="bg-blue-100">
//                       <tr>
//                         <th className="p-3 text-left font-bold text-blue-900">Frame</th>
//                         <th className="p-3 text-center font-bold text-blue-900">{matchDetails.player1?.name || 'Player 1'}</th>
//                         <th className="p-3 text-center font-bold text-blue-900">{matchDetails.player2?.name || 'Player 2'}</th>
//                         {matchDetails.sport === 'snooker' && (
//                           <>
//                             <th className="p-3 text-center font-bold text-blue-900">P1 Break</th>
//                             <th className="p-3 text-center font-bold text-blue-900">P2 Break</th>
//                           </>
//                         )}
//                         {matchDetails.sport === 'pooker' && (
//                           <>
//                             <th className="p-3 text-center font-bold text-blue-900">P1 Balls</th>
//                             <th className="p-3 text-center font-bold text-blue-900">P2 Balls</th>
//                             <th className="p-3 text-center font-bold text-blue-900">Black Finish</th>
//                           </>
//                         )}
//                         {matchDetails.sport === 'pool' && (
//                           <>
//                             <th className="p-3 text-center font-bold text-blue-900">P1 Balls</th>
//                             <th className="p-3 text-center font-bold text-blue-900">P2 Balls</th>
//                             <th className="p-3 text-center font-bold text-blue-900">7-Ball Win</th>
//                           </>
//                         )}
//                         <th className="p-3 text-center font-bold text-blue-900">Winner</th>
//                       </tr>
//                     </thead>
//                     <tbody>
//                       {formData.frameScores
//                         .filter(frame => frame.player1Score !== '' || frame.player2Score !== '')
//                         .map((frame, index) => {
//                           const p1Score = parseInt(frame.player1Score) || 0;
//                           const p2Score = parseInt(frame.player2Score) || 0;
//                           const winner = p1Score > p2Score ? matchDetails.player1?.name : p2Score > p1Score ? matchDetails.player2?.name : 'Draw';
//                           const winnerColor = p1Score > p2Score ? 'text-blue-600' : p2Score > p1Score ? 'text-red-600' : 'text-gray-600';

//                           return (
//                             <tr key={frame.frameNumber} className={index % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
//                               <td className="p-3 font-medium text-gray-700">#{frame.frameNumber}</td>
//                               <td className="p-3 text-center font-bold text-blue-600">{frame.player1Score || '-'}</td>
//                               <td className="p-3 text-center font-bold text-red-600">{frame.player2Score || '-'}</td>
//                               {matchDetails.sport === 'snooker' && (
//                                 <>
//                                   <td className="p-3 text-center text-blue-600">{frame.player1Break || '-'}</td>
//                                   <td className="p-3 text-center text-red-600">{frame.player2Break || '-'}</td>
//                                 </>
//                               )}
//                               {matchDetails.sport === 'pooker' && (
//                                 <>
//                                   <td className="p-3 text-center text-blue-600">{frame.player1BallsPotted || '-'}</td>
//                                   <td className="p-3 text-center text-red-600">{frame.player2BallsPotted || '-'}</td>
//                                   <td className="p-3 text-center text-purple-600">{frame.isBlackFinish ? 'Yes' : '-'}</td>
//                                 </>
//                               )}
//                               {matchDetails.sport === 'pool' && (
//                                 <>
//                                   <td className="p-3 text-center text-blue-600">{frame.player1BallsPotted || '-'}</td>
//                                   <td className="p-3 text-center text-red-600">{frame.player2BallsPotted || '-'}</td>
//                                   <td className="p-3 text-center text-purple-600">{frame.isSevenBallWin ? 'Yes' : '-'}</td>
//                                 </>
//                               )}
//                               <td className={`p-3 text-center font-bold ${winnerColor}`}>{winner}</td>
//                             </tr>
//                           );
//                         })}
//                     </tbody>
//                   </table>
//                 </div>
//                 <div className="mt-4 text-sm text-blue-700 bg-blue-100 p-3 rounded-lg">
//                   <strong>Summary:</strong> {matchDetails.player1?.name} won {formData.player1Score} frames, {matchDetails.player2?.name} won {formData.player2Score} frames
//                 </div>
//               </div>
//             )}

//             {matchDetails?.league?.reporting?.photoProof && (
//               <div>
//                 <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider flex items-center gap-2">
//                   Photo Proof
//                   <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-black">Required</span>
//                 </label>
//                 <div className="flex items-center gap-6">
//                   <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50/50 hover:border-gray-300 transition-all group">
//                     <div className="flex flex-col items-center justify-center pt-4 pb-5">
//                       {previewImage ? (
//                         <img src={previewImage} alt="Preview" className="h-28 object-contain rounded-lg shadow-sm" />
//                       ) : (
//                         <>
//                           <FaFileUpload className="text-2xl text-gray-300 mb-2 group-hover:text-gray-400 transition-colors" />
//                           <p className="mb-1 text-[11px] text-gray-400 font-black uppercase tracking-wider">Upload Proof</p>
//                           <p className="text-[9px] text-gray-300 font-medium">PNG, JPG up to 10MB</p>
//                         </>
//                       )}
//                     </div>
//                     <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
//                   </label>
//                   {previewImage && (
//                     <button onClick={() => { setPreviewImage(null); setFormData(p => ({ ...p, resultImage: null })) }} className="text-red-400 hover:text-red-600 transition-colors">
//                       <FaTimes className="text-lg" />
//                     </button>
//                   )}
//                 </div>
//               </div>
//             )}

//             <div>
//               <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Additional Notes</label>
//               <textarea
//                 value={formData.notes}
//                 onChange={(e) => handleInputChange('notes', e.target.value)}
//                 className="w-full border-2 border-gray-100 rounded-xl p-3 text-xs font-medium focus:border-[#132F45] focus:outline-none bg-gray-50/30"
//                 placeholder="Any notable breaks or match events..."
//                 rows="2"
//               />
//             </div>

//             <div className="flex justify-between pt-6 border-t border-gray-100 mt-4">
//               <button onClick={prevStep} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-700 font-bold transition-colors">
//                 <FaChevronLeft className="text-[9px]" /> Back
//               </button>
//               <Button
//                 onClick={handleSubmit}
//                 variant="primary"
//                 loading={loading}
//                 className="!bg-red-600 hover:!bg-red-700 text-white !px-7 !py-2.5 !rounded-xl !font-black !text-sm uppercase tracking-wider shadow-xl shadow-red-500/20"
//               >
//                 <FaSave className="mr-2 inline" /> Submit Result
//               </Button>
//             </div>
//           </div>
//         );

//       default:
//         return null;
//     }
//   };

//   const STEPS = [
//     { n: 1, label: 'Sport' },
//     { n: 2, label: 'League' },
//     { n: 3, label: 'Match' },
//     { n: 4, label: 'Type' },
//     { n: 5, label: 'Score' },
//     { n: 6, label: 'Review' },
//   ];

//   const initialLoading = loadingGames || loadingContexts || loadingBookings;

//   if (initialLoading) {
//     return (
//       <Loader
//         text={
//           loadingGames ? "Loading sports..." :
//           loadingContexts ? `Fetching ${formData.contextType}s...` :
//           "Retrieving matches..."
//         }
//       />
//     );
//   }

//   return (
//     <div className="min-h-screen bg-[#FAFAFA] relative">
//       {loading && <Loader text="Submitting result..." />}

//       {/* Hero Header */}
//       <div className="bg-[#132F45] pt-5 pb-10 relative overflow-hidden">
//         <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
//         <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
//         <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
//           <div className="text-[7.5px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-2.5 flex items-center gap-2.5">
//             <div className="w-5 h-[1px] bg-[#BA995D]" /> Match Reporting
//           </div>
//           <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">
//             Report <span className="text-[#BA995D]">Score</span>
//           </h1>
//           <p className="text-white/30 font-black text-[7.5px] uppercase tracking-[0.2em] mt-3 max-w-md leading-relaxed">
//             Record your match results for official league standings.
//           </p>
//         </div>
//       </div>

//       {/* Step progress bar */}
//       <div className="bg-white border-b border-gray-100 shadow-xl shadow-[#132F45]/5 sticky top-0 z-40">
//         <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5">
//           <div className="flex items-center gap-1">
//             {STEPS.map((s, i) => (
//               <React.Fragment key={s.n}>
//                 <div className="flex flex-col items-center">
//                   <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[7px] font-black border-2 transition-all duration-500 ${
//                     currentStep > s.n
//                       ? 'bg-[#BA995D] border-[#BA995D] text-white shadow-lg shadow-[#BA995D]/10'
//                       : currentStep === s.n
//                       ? 'bg-[#132F45] border-[#132F45] text-white shadow-xl shadow-[#132F45]/20 scale-105'
//                       : 'bg-white border-gray-100 text-gray-300'
//                   }`}>
//                     {currentStep > s.n ? <FaCheckCircle className="text-[8px]" /> : s.n}
//                   </div>
//                   <span className={`text-[6px] font-black uppercase tracking-widest mt-1 hidden sm:block ${
//                     currentStep >= s.n ? 'text-[#132F45]' : 'text-gray-300'
//                   }`}>{s.label}</span>
//                 </div>
//                 {i < STEPS.length - 1 && (
//                   <div className={`flex-1 h-0.5 mx-1 rounded-full transition-all duration-700 ${
//                     currentStep > s.n ? 'bg-[#BA995D]' : 'bg-gray-100'
//                   }`} />
//                 )}
//               </React.Fragment>
//             ))}
//           </div>
//         </div>
//       </div>

//       <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 font-medium">
//         <div className="bg-white rounded-2xl shadow-xl shadow-[#132F45]/5 border border-gray-50 overflow-hidden outline outline-1 outline-[#FDF2D1]">
//           <div className="p-5 sm:p-6">
//             {renderStep()}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }




import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaBullseye, FaCircle, FaDice, FaClipboard, FaCheckCircle,
  FaChevronRight, FaChevronLeft, FaFileUpload, FaSave, FaTimes,
  FaTrophy
} from 'react-icons/fa';
import Button from '../../../ui/Button';
import Card from '../../../ui/Card';
import Loader from '../../../ui/Loader';
import matchResultService from '../../../../Services/matchResultService';
import { useNotification } from '../../../../contexts/NotificationContext';
import LeagueRulesCard from './LeagueRulesCard';
import { usePlayerSportBooking } from '../player-flow/PlayerSportBookingContext';
import SportTabs from '../player-flow/SportTabs';
import TournamentDropdown from '../player-flow/TournamentDropdown';
import ScoreTable from '../player-flow/ScoreTable';
import { normalizeSport } from '../player-flow/sportUtils';

export default function UploadScore() {
  const navigate = useNavigate();
  const { showToast } = useNotification();

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingContexts, setLoadingContexts] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [games, setGames] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchDetails, setMatchDetails] = useState(null);

  const [formData, setFormData] = useState({
    gameId: '',
    contextType: 'league', // 'league' or 'tournament'
    contextId: '',
    bookingId: '',
    isWalkover: false, // NEW: Track if this is a walkover
    walkoverWinner: null, // NEW: Who won by walkover
    winnerId: null, // NEW: For tie-breaks (e.g. re-spotted black winner)
    player1Score: '',
    player2Score: '',
    frameScores: [], // Detail scores for snooker/pool
    notes: '',
    resultImage: null,
    tieBreakMethod: 'deciding_frame'
  });

  const [previewImage, setPreviewImage] = useState(null);

  // Fetch games on mount
  useEffect(() => {
    const fetchGames = async () => {
      setLoadingGames(true);
      try {
        const data = await matchResultService.getAvailableGames();
        // Check which games have bookings and add counters
        const gamesWithBookings = await Promise.all(
          (data.data || []).map(async (game, index) => {
            try {
              // Check leagues for this game
              const leagueData = await matchResultService.getLeaguesByGame(game.id);
              const leaguesWithBookings = await Promise.all(
                (leagueData.data || []).map(async (league) => {
                  try {
                    const bookingsData = await matchResultService.getLeagueBookings(league.id);
                    return { ...league, matchCount: (bookingsData.data || []).length };
                  } catch (e) {
                    return { ...league, matchCount: 0 };
                  }
                })
              );

              // Check tournaments for this game
              const tournamentData = await matchResultService.getTournamentsByGame(game.id);
              const tournamentsWithBookings = await Promise.all(
                (tournamentData.data || []).map(async (tournament) => {
                  try {
                    const bookingsData = await matchResultService.getTournamentBookings(tournament.id);
                    return { ...tournament, matchCount: (bookingsData.data || []).length };
                  } catch (e) {
                    return { ...tournament, matchCount: 0 };
                  }
                })
              );

              const totalBookings = leaguesWithBookings.reduce((sum, l) => sum + l.matchCount, 0) +
                tournamentsWithBookings.reduce((sum, t) => sum + t.matchCount, 0);

              return {
                ...game,
                hasBookings: totalBookings > 0,
                bookingCount: totalBookings
              };
            } catch (e) {
              return {
                ...game,
                hasBookings: false,
                bookingCount: 0
              };
            }
          })
        );

        setGames(gamesWithBookings);
      } catch (error) {
        showToast('Failed to fetch games', 'error');
      } finally {
        setLoadingGames(false);
      }
    };
    fetchGames();
  }, []);

  // Fetch leagues/tournaments when game changes
  useEffect(() => {
    if (formData.gameId) {
      const fetchData = async () => {
        setLoadingContexts(true);
        try {
          if (formData.contextType === 'league') {
            const data = await matchResultService.getLeaguesByGame(formData.gameId);
            const leaguesWithMatchCount = await Promise.all(
              (data.data || []).map(async (league) => {
                try {
                  const bookingsData = await matchResultService.getLeagueBookings(league.id);
                  return { ...league, matchCount: (bookingsData.data || []).length };
                } catch (e) {
                  return { ...league, matchCount: 0 };
                }
              })
            );
            // Only keep leagues that actually have confirmed bookings available
            setLeagues(leaguesWithMatchCount.filter(l => l.matchCount > 0));
          } else {
            const data = await matchResultService.getTournamentsByGame(formData.gameId);
            const tournamentsWithMatchCount = await Promise.all(
              (data.data || []).map(async (tournament) => {
                try {
                  const bookingsData = await matchResultService.getTournamentBookings(tournament.id);
                  return { ...tournament, matchCount: (bookingsData.data || []).length };
                } catch (e) {
                  return { ...tournament, matchCount: 0 };
                }
              })
            );
            // Only keep tournaments that actually have confirmed bookings available
            setTournaments(tournamentsWithMatchCount.filter(t => t.matchCount > 0));
          }
        } catch (error) {
          showToast(`Failed to fetch ${formData.contextType}s`, 'error');
        } finally {
          setLoadingContexts(false);
        }
      };
      fetchData();
    }
  }, [formData.gameId, formData.contextType]);

  // Fetch bookings when contextId changes
  useEffect(() => {
    if (formData.contextId) {
      const fetchBookings = async () => {
        setLoadingBookings(true);
        try {
          let data;
          if (formData.contextType === 'league') {
            data = await matchResultService.getLeagueBookings(formData.contextId);
          } else {
            data = await matchResultService.getTournamentBookings(formData.contextId);
          }
          setBookings(data.data || []);
        } catch (error) {
          showToast('Failed to fetch bookings', 'error');
        } finally {
          setLoadingBookings(false);
        }
      };
      fetchBookings();
    }
  }, [formData.contextId, formData.contextType]);

  // Fetch match details when bookingId changes
  useEffect(() => {
    if (formData.bookingId) {
      const fetchDetails = async () => {
        try {
          const data = await matchResultService.getBookingDetails(formData.bookingId);
          const details = data.data;
          setMatchDetails(details);

          // Initialize frameScores if the league requires detailed scoring
          if (details.matchConfig?.scoreDetail === 'frame_by_frame') {
            const totalFrames = details.matchConfig.totalFrames || 0;
            const initialFrames = Array.from({ length: totalFrames }, (_, i) => ({
              frameNumber: i + 1,
              player1Score: '',
              player2Score: '',
              player1Break: '',
              player2Break: '',
              player1BallsPotted: '',
              player2BallsPotted: '',
              isBlackFinish: false,
              isWhitewash: false,
              isSevenBallWin: false,
              winnerId: null
            }));
            setFormData(prev => ({ ...prev, frameScores: initialFrames }));
          }
        } catch (error) {
          showToast('Failed to fetch match details', 'error');
        }
      };
      fetchDetails();
    }
  }, [formData.bookingId]);

  const isDigitsOnly = (value) => value === '' || /^[0-9]+$/.test(value);
  const normalizeNumericInput = (value) => {
    if (value === '' || value == null) return '';
    const digits = String(value).replace(/\D+/g, '');
    return digits;
  };
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  const handleNumericInputChange = (field, value) => {
    handleInputChange(field, normalizeNumericInput(value));
  };
  const allowNumericKey = (e) => {
    const allowedKeys = ['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Home', 'End'];
    if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const updateFrameScore = (index, field, value) => {
    const newFrames = [...formData.frameScores];
    const numericFields = ['player1Score', 'player2Score', 'player1Break', 'player2Break', 'player1BallsPotted', 'player2BallsPotted'];
    const sanitizedValue = numericFields.includes(field) ? normalizeNumericInput(value) : value;
    newFrames[index][field] = sanitizedValue;

    // Auto-calculate player scores
    let p1Wins = 0;
    let p2Wins = 0;

    newFrames.forEach(f => {
      const s1 = parseInt(f.player1Score) || 0;
      const s2 = parseInt(f.player2Score) || 0;
      if (s1 > s2) p1Wins++;
      else if (s2 > s1) p2Wins++;
    });

    setFormData(prev => ({
      ...prev,
      frameScores: newFrames,
      player1Score: p1Wins.toString(),
      player2Score: p2Wins.toString()
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, resultImage: file }));
      const reader = new FileReader();
      reader.onloadend = () => setPreviewImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const nextStep = () => setCurrentStep(prev => prev + 1);
  const prevStep = () => setCurrentStep(prev => prev - 1);

  const handleSubmit = async () => {
    let isValid = false;

    if (formData.isWalkover) {
      // For walkover, just need to know the winner
      if (!formData.walkoverWinner) {
        showToast('Please select the walkover winner', 'warning');
        return;
      }
      isValid = true;
    } else {
      // For normal score, need both scores — treat numeric 0 as valid
      isValid = true;
    }

    // Check if photo proof is required by league configuration
    const reportingConfig = matchDetails?.league?.reporting || matchDetails?.booking?.league?.reporting;
    const isPhotoProofRequired = reportingConfig?.photoProof === true;

    if (isPhotoProofRequired && !formData.isWalkover && !formData.resultImage) {
      showToast('Photo proof is required for this league. Please upload a match image.', 'warning');
      return;
    }

    if (!isValid) return;

    setLoading(true);
    try {
      const submissionData = new FormData();
      submissionData.append('bookingId', formData.bookingId);
      const sport = matchDetails.sport || matchDetails.booking?.sport || matchDetails.league?.sport;
      submissionData.append('sport', sport);

      // Handle walkover
      if (formData.isWalkover) {
        submissionData.append('isWalkover', 'true');
        submissionData.append('walkoverWinner', formData.walkoverWinner);
        submissionData.append('notes', formData.notes || 'No-show walkover');
      } else {
        // Depending on sport, set the right fields
        if (sport === 'snooker' || sport === 'pooker') {
          submissionData.append('player1Frames', formData.player1Score);
          submissionData.append('player2Frames', formData.player2Score);
        } else if (sport === 'pool') {
          submissionData.append('player1RackWins', formData.player1Score);
          submissionData.append('player2RackWins', formData.player2Score);
        } else if (sport === 'poker') {
          submissionData.append('player1Score', formData.player1Score);
          submissionData.append('player2Score', formData.player2Score);
        }

        submissionData.append('notes', formData.notes);
        if (formData.resultImage) {
          submissionData.append('resultImage', formData.resultImage);
        }

        // Add frame scores if detail level is frame_by_frame
        if (matchDetails.matchConfig?.scoreDetail === 'frame_by_frame') {
          // Default empty strings to '0' so "missed" frames are recorded correctly
          const processedFrames = formData.frameScores.map(f => ({
            ...f,
            player1Score: f.player1Score === '' ? '0' : f.player1Score,
            player2Score: f.player2Score === '' ? '0' : f.player2Score,
            player1BallsPotted: f.player1BallsPotted === '' ? '0' : f.player1BallsPotted,
            player2BallsPotted: f.player2BallsPotted === '' ? '0' : f.player2BallsPotted,
            player1Break: f.player1Break === '' ? '0' : f.player1Break,
            player2Break: f.player2Break === '' ? '0' : f.player2Break,
          }));
          submissionData.append('frameScores', JSON.stringify(processedFrames));
        }

        // Add winnerId and tieBreakMethod if it's a tie-break winner
        if (formData.winnerId) {
          submissionData.append('winnerId', formData.winnerId);
          submissionData.append('tieBreakMethod', formData.tieBreakMethod);
        }
      }

      await matchResultService.submitMatchResult(submissionData);
      showToast('Match result submitted successfully!', 'success');
      navigate('/player/results');
    } catch (error) {
      showToast(error.message || 'Failed to submit result', 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    // Get config from matchDetails if available
    const config = matchDetails?.matchConfig;
    const matchRules = (() => {
      if (!config?.matchRules) return {};
      try {
        return typeof config.matchRules === 'string' ? JSON.parse(config.matchRules) : config.matchRules;
      } catch (e) { return {}; }
    })();
    const isDraw = parseInt(formData.player1Score) === parseInt(formData.player2Score) && formData.player1Score !== '' && formData.player2Score !== '';
    const noDrawRequired = (matchRules.noDrawRule && matchRules.noDrawRule !== 'none') || matchRules.allowDraw === false;

    switch (currentStep) {
      case 1: // Select Game
        if (loadingGames) {
          return (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-gray-900">Select Sport</h2>
                <p className="text-sm text-gray-400 mt-0.5">Choose the sport you played</p>
              </div>
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-10 h-10 border-2 border-[#132F45] border-t-transparent rounded-full animate-spin" />
                <p className="mt-3 text-gray-400 text-sm font-medium">Loading available sports…</p>
              </div>
            </div>
          );
        }

        if (games.length === 0) {
          return (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-gray-900">Select Sport</h2>
                <p className="text-sm text-gray-400 mt-0.5">Choose the sport you played</p>
              </div>
              <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <FaClipboard className="text-4xl text-gray-200 mx-auto mb-3" />
                <p className="text-gray-600 font-bold">No matches to report</p>
                <p className="text-sm text-gray-400 mt-1">You have no pending scheduled matches.</p>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em]">Select Sport</h2>
              <p className="text-[8px] font-black text-gray-400 mt-1 uppercase tracking-widest">Which sport did you play?</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {games.map(game => {
                const isActive = formData.gameId === game.id;
                const iconMap = { Snooker: <FaBullseye />, Pool: <FaCircle />, Pooker: <FaDice />, Poker: <FaDice /> };
                return (
                  <button
                    key={game.id}
                    onClick={() => { if (game.hasBookings) { handleInputChange('gameId', game.id); nextStep(); } }}
                    disabled={!game.hasBookings}
                    className={`group relative rounded-xl border overflow-hidden transition-all text-left ${!game.hasBookings ? 'cursor-not-allowed opacity-40 border-gray-50 bg-white' :
                        isActive ? 'border-[#BA995D] bg-[#132F45] shadow-xl shadow-[#132F45]/20' :
                          'border-gray-50 bg-white hover:border-[#FDF2D1] hover:-translate-y-0.5 hover:shadow-lg shadow-sm cursor-pointer'
                      }`}
                  >
                    <div className="p-5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 text-base transition-all ${isActive ? 'bg-[#BA995D] text-white' : 'bg-[#FAFAFA] text-[#132F45] group-hover:bg-[#132F45] group-hover:text-[#BA995D]'
                        }`}>
                        {iconMap[game.name] || <FaBullseye />}
                      </div>
                      <p className={`font-black text-xs uppercase tracking-widest ${isActive ? 'text-white' : 'text-[#132F45]'}`}>{game.name}</p>
                      <p className={`text-[8px] font-black uppercase tracking-widest mt-1 ${isActive ? 'text-[#BA995D]' : game.hasBookings ? 'text-gray-400' : 'text-gray-300'
                        }`}>
                        {game.hasBookings ? `${game.bookingCount} pending` : 'No matches'}
                      </p>
                    </div>
                    {game.hasBookings && (
                      <div className={`absolute top-3 right-3 w-4 h-4 rounded-full flex items-center justify-center ${isActive ? 'bg-[#BA995D]' : 'bg-[#FAFAFA]'
                        }`}>
                        <FaChevronRight className={`text-[6px] ${isActive ? 'text-white' : 'text-gray-400'}`} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 2: // Select Context (League/Tournament)
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em]">Match Type</h2>
                <p className="text-[8px] font-black text-gray-400 mt-1 uppercase tracking-widest">What kind of match was it?</p>
              </div>
            </div>
            <div className="flex gap-1.5 p-1 bg-[#FAFAFA] border border-gray-100 rounded-xl w-fit">
              {['league', 'tournament'].map(t => (
                <button key={t} onClick={() => handleInputChange('contextType', t)}
                  className={`px-4 py-1.5 rounded-lg text-[8px] font-black transition-all capitalize uppercase tracking-widest ${formData.contextType === t ? 'bg-[#132F45] text-white shadow-md' : 'text-gray-400 hover:text-[#132F45]'
                    }`}>{t}s</button>
              ))}
            </div>

            {loadingContexts ? (
              <div className="py-8 flex flex-col items-center justify-center gap-3">
                <div className="w-7 h-7 rounded-full border-2 border-gray-100 border-t-[#BA995D] animate-spin" />
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Loading {formData.contextType}s...</span>
              </div>
            ) : (
              <div className="space-y-2">
                {(formData.contextType === 'league' ? leagues : tournaments).length > 0 ?
                  (formData.contextType === 'league' ? leagues : tournaments).map(item => (
                    <button key={item.id}
                      onClick={() => { handleInputChange('contextId', item.id); nextStep(); }}
                      className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all group ${formData.contextId === item.id
                          ? 'border-[#BA995D] bg-[#132F45] text-white'
                          : 'border-gray-50 hover:border-[#FDF2D1] bg-white'
                        }`}>
                      <div>
                        <p className={`font-black text-[10px] uppercase tracking-tight ${formData.contextId === item.id ? 'text-white' : 'text-[#132F45]'}`}>{item.name}</p>
                        <p className={`text-[8px] font-black mt-0.5 uppercase tracking-widest ${formData.contextId === item.id ? 'text-white/40' : 'text-gray-400'}`}>{item.organization?.name || item.venue?.name || ''}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[8px] font-black px-2.5 py-1 rounded-full ${formData.contextId === item.id ? 'bg-[#BA995D] text-white' : 'bg-[#FAFAFA] text-[#132F45]'
                          }`}>
                          {item.matchCount} left
                        </span>
                        <FaChevronRight className={`text-[9px] group-hover:translate-x-0.5 transition-transform ${formData.contextId === item.id ? 'text-[#BA995D]' : 'text-gray-300'}`} />
                      </div>
                    </button>
                  )) : (
                    <div className="text-center py-10 bg-[#FAFAFA] rounded-xl border border-dashed border-gray-100">
                      <FaTrophy className="text-2xl text-gray-200 mx-auto mb-2" />
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">No {formData.contextType}s found</p>
                    </div>
                  )}
              </div>
            )}
            <div className="pt-2 flex justify-start">
              <button onClick={prevStep} className="group flex items-center gap-2 text-[8px] font-black text-gray-400 uppercase tracking-widest hover:text-[#132F45] transition-colors">
                <div className="w-6 h-6 rounded-full border border-gray-100 flex items-center justify-center group-hover:border-[#BA995D] transition-colors">
                  <FaChevronLeft className="text-[8px]" />
                </div>
                Back
              </button>
            </div>
          </div>
        );

      case 3: // Select Match
        if (loadingBookings) {
          return (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-gray-900">Select Match</h2>
                <p className="text-sm text-gray-400 mt-0.5">Choose the match to report</p>
              </div>
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-[#132F45] border-t-transparent rounded-full animate-spin" />
                <p className="mt-3 text-gray-400 text-sm font-medium">Loading matches…</p>
              </div>
            </div>
          );
        }

        if (bookings.length === 0) {
          return (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-gray-900">Select Match</h2>
                <p className="text-sm text-gray-400 mt-0.5">Choose the match to report</p>
              </div>
              <div className="text-center py-14 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <FaClipboard className="text-3xl text-gray-200 mx-auto mb-3" />
                <p className="text-gray-600 font-bold text-sm">No pending matches</p>
                <p className="text-xs text-gray-400 mt-1">No unscored matches found for this {formData.contextType}.</p>
              </div>
              <div className="pt-2">
                <button onClick={prevStep} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 font-semibold">
                  <FaChevronLeft className="text-[10px]" /> Back
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em]">Select Match</h2>
              <p className="text-[8px] font-black text-gray-400 mt-1 uppercase tracking-widest">{bookings.length} booking{bookings.length !== 1 ? 's' : ''} pending report</p>
            </div>
            <div className="space-y-2">
              {bookings.map(booking => (
                <button
                  key={booking.id}
                  onClick={async () => {
                    handleInputChange('bookingId', booking.id);
                    try {
                      const details = await matchResultService.getBookingDetails(booking.id);
                      setMatchDetails(details.data);
                      handleInputChange('isWalkover', false);
                      handleInputChange('walkoverWinner', null);
                      handleInputChange('winnerId', null);
                      handleInputChange('player1Score', '');
                      handleInputChange('player2Score', '');
                      nextStep();
                    } catch (error) {
                      showToast('Failed to load match details', 'error');
                    }
                  }}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all group ${formData.bookingId === booking.id
                      ? 'border-[#BA995D] bg-[#132F45]'
                      : 'border-gray-50 bg-white hover:border-[#FDF2D1] hover:shadow-md shadow-sm'
                    }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[8px] font-black shrink-0 ${formData.bookingId === booking.id ? 'bg-[#BA995D] text-white' : 'bg-[#FAFAFA] text-[#132F45]'
                      }`}>VS</div>
                    <div className="min-w-0">
                      <p className={`font-black text-[10px] uppercase tracking-tight truncate ${formData.bookingId === booking.id ? 'text-white' : 'text-[#132F45]'
                        }`}>
                        {booking.player?.name || 'Player 1'}
                        <span className={`font-black mx-1.5 ${formData.bookingId === booking.id ? 'text-[#BA995D]' : 'text-gray-300'
                          }`}>vs</span>
                        {booking.opponent?.name || 'Player 2'}
                      </p>
                      <p className={`text-[7.5px] font-black mt-0.5 uppercase tracking-widest truncate ${formData.bookingId === booking.id ? 'text-white/40' : 'text-gray-400'
                        }`}>
                        {booking.bookingDate ? (() => {
                          // Parse date string (YYYY-MM-DD) to avoid timezone issues
                          const dateParts = booking.bookingDate.split('T')[0].split('-');
                          const day = String(parseInt(dateParts[2])).padStart(2, '0');
                          const monthIndex = parseInt(dateParts[1]) - 1;
                          const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthIndex];
                          return `${day} ${month}`;
                        })() : 'TBD'}
                        {booking.venue?.name ? ` · ${booking.venue.name}` : ''}
                        {booking.fixture?.round ? ` · Rnd ${booking.fixture.round}` : ''}
                      </p>
                    </div>
                  </div>
                  <FaChevronRight className={`text-[9px] flex-shrink-0 ml-3 group-hover:translate-x-0.5 transition-transform ${formData.bookingId === booking.id ? 'text-[#BA995D]' : 'text-gray-300'
                    }`} />
                </button>
              ))}
            </div>
            <div className="pt-2">
              <button onClick={prevStep} className="group flex items-center gap-2 text-[8px] font-black text-gray-400 uppercase tracking-widest hover:text-[#132F45] transition-colors">
                <div className="w-6 h-6 rounded-full border border-gray-100 flex items-center justify-center group-hover:border-[#BA995D] transition-colors">
                  <FaChevronLeft className="text-[8px]" />
                </div>
                Back
              </button>
            </div>
          </div>
        );

      case 4: // Walkover or Regular Score Selection
        if (!matchDetails) return (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-[#132F45] border-t-transparent rounded-full animate-spin" />
          </div>
        );
        // Get walkover rule from matchRules
        const walkoverRule = (() => {
          const config = matchDetails?.matchConfig;
          if (!config?.matchRules) return undefined;
          try {
            const rules = typeof config.matchRules === 'string' ? JSON.parse(config.matchRules) : config.matchRules;
            // Check new walkover.rule path, then fallback to legacy walkoverType
            return rules.walkover?.rule || rules.walkoverType;
          } catch {
            return undefined;
          }
        })();
        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em]">Match Result</h2>
              <p className="text-[8px] font-black text-gray-400 mt-1 uppercase tracking-widest">Did both players play the match?</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => { handleInputChange('isWalkover', false); nextStep(); }}
                className={`p-5 rounded-xl border-2 text-left transition-all group ${!formData.isWalkover ? 'border-[#BA995D] bg-[#132F45]' : 'border-gray-50 bg-white hover:border-[#FDF2D1]'
                  }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 transition-all ${!formData.isWalkover ? 'bg-[#BA995D]' : 'bg-[#FAFAFA] group-hover:bg-[#132F45]'
                  }`}>
                  <FaCheckCircle className={`text-sm ${!formData.isWalkover ? 'text-white' : 'text-[#132F45] group-hover:text-[#BA995D]'
                    }`} />
                </div>
                <h3 className={`font-black text-[10px] uppercase tracking-widest ${!formData.isWalkover ? 'text-white' : 'text-[#132F45]'
                  }`}>Played Match</h3>
                <p className={`text-[8px] font-black mt-1.5 uppercase tracking-widest leading-relaxed ${!formData.isWalkover ? 'text-white/40' : 'text-gray-400'
                  }`}>Both players played the match</p>
              </button>

              {/* Only show walkover option if walkoverRule is not admin-decided ('admin' or 'adminDecide') */}
              {walkoverRule !== 'admin' && walkoverRule !== 'adminDecide' && (
                <button
                  onClick={() => { handleInputChange('isWalkover', true); nextStep(); }}
                  className={`p-5 rounded-xl border-2 text-left transition-all group ${formData.isWalkover ? 'border-red-500 bg-red-600' : 'border-gray-50 bg-white hover:border-red-100'
                    }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 transition-all ${formData.isWalkover ? 'bg-red-500' : 'bg-[#FAFAFA] group-hover:bg-red-50'
                    }`}>
                    <FaTimes className={`text-sm ${formData.isWalkover ? 'text-white' : 'text-red-400'
                      }`} />
                  </div>
                  <h3 className={`font-black text-[10px] uppercase tracking-widest ${formData.isWalkover ? 'text-white' : 'text-[#132F45]'
                    }`}>No-Show / Walkover</h3>
                  <p className={`text-[8px] font-black mt-1.5 uppercase tracking-widest leading-relaxed ${formData.isWalkover ? 'text-white/50' : 'text-gray-400'
                    }`}>One player did not show up</p>
                </button>
              )}
            </div>

            <div className="pt-1">
              <button onClick={prevStep} className="group flex items-center gap-2 text-[8px] font-black text-gray-400 uppercase tracking-widest hover:text-[#132F45] transition-colors">
                <div className="w-6 h-6 rounded-full border border-gray-100 flex items-center justify-center group-hover:border-[#BA995D] transition-colors">
                  <FaChevronLeft className="text-[8px]" />
                </div>
                Back
              </button>
            </div>
          </div>
        );

      case 5: // Enter Score or Walkover Winner Selection
        if (!matchDetails) return (
          <div className="py-8 flex flex-col items-center justify-center gap-3">
            <div className="w-7 h-7 rounded-full border-2 border-gray-100 border-t-[#BA995D] animate-spin" />
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Loading match data...</span>
          </div>
        );

        // If this is a walkover, show winner selection
        if (formData.isWalkover) {
          return (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-widest">Walkover Winner</h2>
                <p className="text-[8px] font-black text-gray-400 mt-1 uppercase tracking-widest">Which player wins the walkover?</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => handleInputChange('walkoverWinner', matchDetails.player1.id)}
                  className={`p-5 rounded-xl border-2 transition-all text-center flex flex-col items-center gap-3 ${formData.walkoverWinner === matchDetails.player1.id
                      ? 'border-[#BA995D] bg-[#132F45] shadow-xl shadow-[#132F45]/20'
                      : 'border-gray-50 bg-white hover:border-[#FDF2D1] hover:shadow-md'
                    }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black transition-all ${formData.walkoverWinner === matchDetails.player1.id ? 'bg-[#BA995D] text-white' : 'bg-[#FAFAFA] text-[#132F45]'
                    }`}>
                    {matchDetails.player1?.name?.charAt(0) || 'P1'}
                  </div>
                  <div className="space-y-1">
                    <h3 className={`text-[10px] font-black uppercase tracking-widest ${formData.walkoverWinner === matchDetails.player1.id ? 'text-white' : 'text-[#132F45]'
                      }`}>{matchDetails.player1?.name || 'Player 1'}</h3>
                    <p className={`text-[8px] font-black uppercase tracking-widest ${formData.walkoverWinner === matchDetails.player1.id ? 'text-[#BA995D]' : 'text-gray-400'
                      }`}>Wins Walkover</p>
                  </div>
                </button>

                <button
                  onClick={() => handleInputChange('walkoverWinner', matchDetails.player2.id)}
                  className={`p-5 rounded-xl border-2 transition-all text-center flex flex-col items-center gap-3 ${formData.walkoverWinner === matchDetails.player2.id
                      ? 'border-[#BA995D] bg-[#132F45] shadow-xl shadow-[#132F45]/20'
                      : 'border-gray-50 bg-white hover:border-[#FDF2D1] hover:shadow-md'
                    }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black transition-all ${formData.walkoverWinner === matchDetails.player2.id ? 'bg-[#BA995D] text-white' : 'bg-[#FAFAFA] text-[#132F45]'
                    }`}>
                    {matchDetails.player2?.name?.charAt(0) || 'P2'}
                  </div>
                  <div className="space-y-1">
                    <h3 className={`text-[10px] font-black uppercase tracking-widest ${formData.walkoverWinner === matchDetails.player2.id ? 'text-white' : 'text-[#132F45]'
                      }`}>{matchDetails.player2?.name || 'Player 2'}</h3>
                    <p className={`text-[8px] font-black uppercase tracking-widest ${formData.walkoverWinner === matchDetails.player2.id ? 'text-[#BA995D]' : 'text-gray-400'
                      }`}>Wins Walkover</p>
                  </div>
                </button>
              </div>

              <div>
                <label className="block text-[8px] font-black text-gray-400 mb-2 uppercase tracking-widest">Walkover Reason (Optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="e.g., Player did not show up, withdrew..."
                  className="w-full border-2 border-gray-50 rounded-xl p-3.5 text-[10px] font-medium focus:border-[#BA995D] focus:outline-none bg-[#FAFAFA] placeholder:text-gray-300 resize-none"
                  rows="2"
                />
              </div>

              <div className="flex justify-between pt-4 border-t border-gray-50">
                <button onClick={prevStep} className="group flex items-center gap-2 text-[8px] font-black text-gray-400 uppercase tracking-widest hover:text-[#132F45] transition-colors">
                  <div className="w-6 h-6 rounded-full border border-gray-100 flex items-center justify-center group-hover:border-[#BA995D] transition-colors">
                    <FaChevronLeft className="text-[8px]" />
                  </div>
                  Back
                </button>
                <button
                  onClick={() => formData.walkoverWinner ? nextStep() : showToast('Please select the winner', 'warning')}
                  className={`px-8 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-xl flex items-center gap-3 ${formData.walkoverWinner
                      ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-500/20'
                      : 'bg-gray-100 text-gray-300 shadow-none cursor-not-allowed'
                    }`}
                >
                  Submit Walkover <FaChevronRight className="text-[8px]" />
                </button>
              </div>
            </div>
          );
        }

        // Regular score entry form
        const validateStep4 = () => {
          // In Total Upload Score mode (scoreDetail: 'points'), players submit raw totals
          const isTotalUploadScore = config?.scoreDetail === 'points';

          // Require both scores — but treat 0 as a valid score (use strict empty-string check)
          const p1Empty = formData.player1Score === '' || formData.player1Score === null || formData.player1Score === undefined;
          const p2Empty = formData.player2Score === '' || formData.player2Score === null || formData.player2Score === undefined;
          if (p1Empty || p2Empty) {
            showToast('Please enter both scores', 'warning');
            return false;
          }

          if ((config?.isBestOf || config?.isRaceTo) && !isTotalUploadScore) {
            const p1 = parseInt(formData.player1Score);
            const p2 = parseInt(formData.player2Score);
            const framesToWin = config.framesToWin;
            const totalFrames = config.totalFrames;
            const ruleName = config.isRaceTo ? `Race to ${framesToWin}` : `Best of ${totalFrames}`;

            // For Race to X: Neither player can have more than framesToWin
            if (config.isRaceTo && (p1 > framesToWin || p2 > framesToWin)) {
              showToast(`Match rule: ${ruleName}. A player cannot win more than ${framesToWin} frames.`, 'warning');
              return false;
            }

            // For Best of X: Total frames played cannot exceed the maximum possible
            if (config.isBestOf && (p1 + p2 > totalFrames)) {
              showToast(`Match rule: ${ruleName}. Total frames (${p1 + p2}) exceeds the maximum possible (${totalFrames}).`, 'warning');
              return false;
            }

            // For Best of X: Check if the match result makes sense (at least one player should have framesToWin if it's a complete match)
            if (config.isBestOf && p1 + p2 === totalFrames && p1 < framesToWin && p2 < framesToWin) {
              showToast(`Match rule: ${ruleName}. In a complete match, at least one player must reach ${framesToWin} wins.`, 'warning');
              return false;
            }

            // For frame-by-frame scoring, validate frame consistency
            if (config?.scoreDetail === 'frame_by_frame') {
              const playedFrames = formData.frameScores.filter(f => f.player1Score !== '' || f.player2Score !== '');
              const totalPlayedFrames = playedFrames.length;

              const invalidFrame = playedFrames.find(f =>
                !isDigitsOnly(f.player1Score) ||
                !isDigitsOnly(f.player2Score) ||
                (matchDetails.sport === 'snooker' && (!isDigitsOnly(f.player1Break) || !isDigitsOnly(f.player2Break))) ||
                ((matchDetails.sport === 'pooker' || matchDetails.sport === 'pool') && (!isDigitsOnly(f.player1BallsPotted) || !isDigitsOnly(f.player2BallsPotted)))
              );
              if (invalidFrame) {
                showToast('Please use only numbers in all entered frame score fields.', 'warning');
                return false;
              }

              let calculatedP1Wins = 0;
              let calculatedP2Wins = 0;
              playedFrames.forEach(f => {
                const s1 = parseInt(f.player1Score) || 0;
                const s2 = parseInt(f.player2Score) || 0;
                if (s1 > s2) calculatedP1Wins++;
                else if (s2 > s1) calculatedP2Wins++;
              });

              if (calculatedP1Wins !== p1 || calculatedP2Wins !== p2) {
                showToast('Frame scores do not match the calculated totals. Please check your frame entries.', 'warning');
                return false;
              }

              if (matchDetails.sport === 'pooker') {
                const invalidFrames = playedFrames.filter(f => f.player1BallsPotted === '' || f.player2BallsPotted === '');
                if (invalidFrames.length > 0) {
                  showToast('Balls potted data is required for each played Pooker frame.', 'warning');
                  return false;
                }
              }

              // For Best of X, ensure we don't have more frames than possible
              if (config.isBestOf && totalPlayedFrames > totalFrames) {
                showToast(`Match rule: ${ruleName}. Cannot play more than ${totalFrames} frames.`, 'warning');
                return false;
              }
            }
          }

          // Check Draw Resolution Rule
          const noDrawRequiredLocal = (matchRules.noDrawRule && matchRules.noDrawRule !== 'none') || matchRules.allowDraw === false;
          if (noDrawRequiredLocal && parseInt(formData.player1Score) === parseInt(formData.player2Score)) {
            if (!formData.winnerId) {
              let ruleLabel = "a tie-break winner";
              if (matchRules.noDrawRule === 'respottedBlack') ruleLabel = "a Re-spotted Black winner";
              else if (matchRules.noDrawRule === 'mostPoints') ruleLabel = "a Most Points winner";
              else if (matchRules.noDrawRule === 'blackFinish') ruleLabel = "a Black Ball Finish winner";

              showToast(`This league does not allow draws. Please specify ${ruleLabel}.`, 'warning');
              return false;
            }
          }

          return true;
        };

        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em]">Enter Score</h2>
              {(config?.isBestOf || config?.isRaceTo) && (
                <div className="inline-block mt-1.5 px-3 py-0.5 bg-[#FAFAFA] text-[#132F45] border border-gray-100 rounded-full text-[8px] font-black uppercase tracking-widest">
                  {config.isRaceTo ? `Race to ${config.framesToWin}` : `Best of ${config.totalFrames}`}
                </div>
              )}
            </div>

            <LeagueRulesCard matchDetails={matchDetails} config={config} />

            <div className="flex items-center justify-center gap-8 md:gap-16 py-3">
              <div className="text-center space-y-3">
                <div className="w-14 h-14 bg-[#132F45] rounded-2xl flex items-center justify-center text-[#BA995D] text-xl font-black mx-auto shadow-lg shadow-[#132F45]/20">
                  {matchDetails.player1?.name?.charAt(0) || 'P1'}
                </div>
                <div className="font-black text-[9px] text-gray-400 uppercase tracking-widest truncate max-w-[90px]">{matchDetails.player1?.name || 'Player 1'}</div>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="0"
                  value={formData.player1Score ?? ''}
                  onKeyDown={allowNumericKey}
                  onChange={(e) => handleNumericInputChange('player1Score', e.target.value)}
                  disabled={config?.scoreDetail === 'frame_by_frame'}
                  className={`w-16 text-center text-3xl font-black border-2 rounded-xl p-1.5 focus:border-[#BA995D] focus:outline-none transition-colors ${config?.scoreDetail === 'frame_by_frame' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-[#132F45]/30'}`}
                  placeholder="0"
                />
              </div>
              <div className="text-lg font-black text-gray-200 uppercase tracking-[0.3em] mb-10">vs</div>
              <div className="text-center space-y-3">
                <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center text-white text-xl font-black mx-auto shadow-lg shadow-red-500/20">
                  {matchDetails.player2?.name?.charAt(0) || 'P2'}
                </div>
                <div className="font-black text-[9px] text-gray-400 uppercase tracking-widest truncate max-w-[90px]">{matchDetails.player2?.name || 'Player 2'}</div>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="0"
                  value={formData.player2Score ?? ''}
                  onKeyDown={allowNumericKey}
                  onChange={(e) => handleNumericInputChange('player2Score', e.target.value)}
                  disabled={config?.scoreDetail === 'frame_by_frame'}
                  className={`w-16 text-center text-3xl font-black border-2 rounded-xl p-1.5 focus:border-[#BA995D] focus:outline-none transition-colors ${config?.scoreDetail === 'frame_by_frame' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-[#132F45]/30'}`}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Tie-break Winner Selection */}
            {noDrawRequired && isDraw && (
              <div className="bg-[#132F45] border border-[#BA995D]/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#BA995D] rounded-lg flex items-center justify-center">
                    <FaTrophy className="text-white text-xs" />
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Draw — Tie-Break Required</h3>
                    <p className="text-[8px] text-white/40 font-black uppercase tracking-widest">League rules require a tie-break resolution.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleInputChange('winnerId', matchDetails.player1.id)}
                    className={`p-3 rounded-xl border-2 transition-all text-center ${formData.winnerId === matchDetails.player1.id
                        ? 'border-[#BA995D] bg-[#BA995D]'
                        : 'border-white/10 bg-white/5 hover:border-[#BA995D]/40'
                      }`}
                  >
                    <span className={`text-[9px] font-black uppercase tracking-widest block ${formData.winnerId === matchDetails.player1.id ? 'text-white' : 'text-white/60'
                      }`}>{matchDetails.player1?.name}</span>
                    {formData.winnerId === matchDetails.player1.id && <FaCheckCircle className="text-white text-[10px] mx-auto mt-1" />}
                  </button>

                  <button
                    onClick={() => handleInputChange('winnerId', matchDetails.player2.id)}
                    className={`p-3 rounded-xl border-2 transition-all text-center ${formData.winnerId === matchDetails.player2.id
                        ? 'border-[#BA995D] bg-[#BA995D]'
                        : 'border-white/10 bg-white/5 hover:border-[#BA995D]/40'
                      }`}
                  >
                    <span className={`text-[9px] font-black uppercase tracking-widest block ${formData.winnerId === matchDetails.player2.id ? 'text-white' : 'text-white/60'
                      }`}>{matchDetails.player2?.name}</span>
                    {formData.winnerId === matchDetails.player2.id && <FaCheckCircle className="text-white text-[10px] mx-auto mt-1" />}
                  </button>
                </div>

                <div>
                  <label className="block text-[8px] font-black text-white/40 uppercase tracking-widest mb-1.5">Resolution Method</label>
                  <select
                    value={formData.tieBreakMethod}
                    onChange={(e) => handleInputChange('tieBreakMethod', e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-[9px] font-black text-white focus:outline-none focus:border-[#BA995D]"
                  >
                    <option value="deciding_frame">Deciding Frame/Rack</option>
                    <option value="highest_break">Highest Break</option>
                    <option value="black_ball">Black Ball Shootout</option>
                    <option value="coin_toss">Coin Toss / Luck</option>
                    <option value="admin_decision">Admin Decision</option>
                  </select>
                </div>
              </div>
            )}

            {config?.scoreDetail === 'frame_by_frame' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[11px] text-blue-900 leading-relaxed">
                  <strong>📋 Frame Breakdown:</strong> Enter each frame result below. The system will calculate totals automatically.
                </div>
                <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 font-black border-b">
                      <tr>
                        <th className="p-2 text-left w-12 text-[10px] uppercase tracking-wider text-gray-500">Frame</th>
                        <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">{matchDetails.player1?.name || 'P1'}</th>
                        <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">{matchDetails.player2?.name || 'P2'}</th>
                        {matchDetails.sport === 'snooker' && (
                          <>
                            <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">P1 Break</th>
                            <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">P2 Break</th>
                          </>
                        )}
                        {matchDetails.sport === 'pooker' && (
                          <>
                            <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">P1 Potted</th>
                            <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">P2 Potted</th>
                          </>
                        )}
                        {matchDetails.sport === 'pool' && (
                          <>
                            <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">P1 Potted</th>
                            <th className="p-2 text-center text-[10px] uppercase tracking-wider text-gray-500">P2 Potted</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {/* Always show all frames up to totalFrames, fill missing with 0-0 */}
                      {(() => {
                        const totalFrames = config?.totalFrames || formData.frameScores.length;
                        return (
                          <>
                            {Array.from({ length: totalFrames }, (_, index) => {
                              const frame = formData.frameScores[index] || {
                                frameNumber: index + 1,
                                player1Score: '0',
                                player2Score: '0',
                                player1Break: '',
                                player2Break: '',
                                player1BallsPotted: '',
                                player2BallsPotted: '',
                                isBlackFinish: false,
                                isWhitewash: false,
                                isSevenBallWin: false,
                                winnerId: null
                              };
                              return (
                                <tr key={frame.frameNumber} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                  <td className="p-2 font-black text-gray-400 text-xs">#{frame.frameNumber}</td>
                                  <td className="p-2 text-center">
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      min="0"
                                      value={frame.player1Score ?? ''}
                                      onKeyDown={allowNumericKey}
                                      onChange={(e) => updateFrameScore(index, 'player1Score', e.target.value)}
                                      className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center font-black text-xs bg-white focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
                                    />
                                  </td>
                                  <td className="p-2 text-center">
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      min="0"
                                      value={frame.player2Score ?? ''}
                                      onKeyDown={allowNumericKey}
                                      onChange={(e) => updateFrameScore(index, 'player2Score', e.target.value)}
                                      className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center font-black text-xs bg-white focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
                                    />
                                  </td>
                                  {matchDetails.sport === 'snooker' && (
                                    <>
                                      <td className="p-2 text-center">
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          min="0"
                                          value={frame.player1Break ?? ''}
                                          onKeyDown={allowNumericKey}
                                          onChange={(e) => updateFrameScore(index, 'player1Break', e.target.value)}
                                          className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center text-[11px] font-bold text-gray-700 bg-white placeholder-gray-300 focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
                                          placeholder="0"
                                        />
                                      </td>
                                      <td className="p-2 text-center">
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          min="0"
                                          value={frame.player2Break ?? ''}
                                          onKeyDown={allowNumericKey}
                                          onChange={(e) => updateFrameScore(index, 'player2Break', e.target.value)}
                                          className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center text-[11px] font-bold text-gray-700 bg-white placeholder-gray-300 focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
                                          placeholder="0"
                                        />
                                      </td>
                                    </>
                                  )}
                                  {matchDetails.sport === 'pooker' && (
                                    <>
                                      <td className="p-3 text-center flex flex-col items-center gap-1">
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          min="0"
                                          value={frame.player1BallsPotted ?? ''}
                                          onKeyDown={allowNumericKey}
                                          onChange={(e) => updateFrameScore(index, 'player1BallsPotted', e.target.value)}
                                          className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center text-xs font-bold text-gray-700 bg-white placeholder-gray-300 focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
                                          placeholder="Balls"
                                        />
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] flex items-center gap-1 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={frame.isBlackFinish && frame.winnerId === matchDetails.player1?.id}
                                              onChange={(e) => {
                                                updateFrameScore(index, 'isBlackFinish', e.target.checked);
                                                updateFrameScore(index, 'winnerId', e.target.checked ? matchDetails.player1?.id : null);
                                              }}
                                            /> Black
                                          </label>
                                          <label className="text-[10px] flex items-center gap-1 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={frame.isSevenBallWin && frame.winnerId === matchDetails.player1?.id}
                                              onChange={(e) => {
                                                updateFrameScore(index, 'isSevenBallWin', e.target.checked);
                                                updateFrameScore(index, 'winnerId', e.target.checked ? matchDetails.player1?.id : null);
                                              }}
                                            /> 7-Ball
                                          </label>
                                        </div>
                                      </td>
                                      <td className="p-3 text-center flex-col items-center gap-1 relative">
                                        <div className="flex flex-col items-center gap-1">
                                          <input
                                            type="number"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            min="0"
                                            value={frame.player2BallsPotted ?? ''}
                                            onKeyDown={allowNumericKey}
                                            onChange={(e) => updateFrameScore(index, 'player2BallsPotted', e.target.value)}
                                            className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center text-xs font-bold text-gray-700 bg-white placeholder-gray-300 focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
                                            placeholder="Balls"
                                          />
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[10px] flex items-center gap-1 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={frame.isBlackFinish && frame.winnerId === matchDetails.player2?.id}
                                                onChange={(e) => {
                                                  updateFrameScore(index, 'isBlackFinish', e.target.checked);
                                                  updateFrameScore(index, 'winnerId', e.target.checked ? matchDetails.player2?.id : null);
                                                }}
                                              /> Black
                                            </label>
                                            <label className="text-[10px] flex items-center gap-1 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={frame.isSevenBallWin && frame.winnerId === matchDetails.player2?.id}
                                                onChange={(e) => {
                                                  updateFrameScore(index, 'isSevenBallWin', e.target.checked);
                                                  updateFrameScore(index, 'winnerId', e.target.checked ? matchDetails.player2?.id : null);
                                                }}
                                              /> 7-Ball
                                            </label>
                                          </div>
                                        </div>
                                      </td>
                                    </>
                                  )}
                                  {matchDetails.sport === 'pool' && (
                                    <>
                                      <td className="p-3 text-center flex flex-col items-center gap-1">
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          min="0"
                                          value={frame.player1BallsPotted ?? ''}
                                          onKeyDown={allowNumericKey}
                                          onChange={(e) => updateFrameScore(index, 'player1BallsPotted', e.target.value)}
                                          className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center text-xs font-bold text-gray-700 bg-white placeholder-gray-300 focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
                                          placeholder="Balls"
                                        />
                                        <label className="text-[10px] flex items-center gap-1 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={frame.isSevenBallWin && frame.winnerId === matchDetails.player1?.id}
                                            onChange={(e) => {
                                              updateFrameScore(index, 'isSevenBallWin', e.target.checked);
                                              updateFrameScore(index, 'winnerId', e.target.checked ? matchDetails.player1?.id : null);
                                            }}
                                          /> 7-Ball
                                        </label>
                                      </td>
                                      <td className="p-3 text-center flex-col items-center gap-1 relative">
                                        <div className="flex flex-col items-center gap-1">
                                          <input
                                            type="number"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            min="0"
                                            value={frame.player2BallsPotted ?? ''}
                                            onKeyDown={allowNumericKey}
                                            onChange={(e) => updateFrameScore(index, 'player2BallsPotted', e.target.value)}
                                            className="w-16 border border-gray-200 hover:border-gray-300 rounded p-1.5 text-center text-xs font-bold text-gray-700 bg-white placeholder-gray-300 focus:outline-none focus:border-[#BA995D] focus:ring-1 focus:ring-[#BA995D] transition-all"
                                            placeholder="Balls"
                                          />
                                          <label className="text-[10px] flex items-center gap-1 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={frame.isSevenBallWin && frame.winnerId === matchDetails.player2?.id}
                                              onChange={(e) => {
                                                updateFrameScore(index, 'isSevenBallWin', e.target.checked);
                                                updateFrameScore(index, 'winnerId', e.target.checked ? matchDetails.player2?.id : null);
                                              }}
                                            /> 7-Ball
                                          </label>
                                        </div>
                                      </td>
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex justify-between pt-6 border-t border-gray-100 mt-4">
              <button onClick={prevStep} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-700 font-bold transition-colors">
                <FaChevronLeft className="text-[9px]" /> Back
              </button>
              <Button onClick={() => validateStep4() && nextStep()} variant="primary" className="!px-6 !py-2 !text-xs !rounded-xl">
                Review & Confirm <FaChevronRight className="ml-1.5 inline text-[10px]" />
              </Button>
            </div>
          </div>
        );

      case 6: // Proof & Review
        if (formData.isWalkover) {
          // Walkover review - use exact same structure as current code
          return ( // Walkover review
            <div className="space-y-6">
              <h2 className="text-lg font-black text-gray-900 tracking-tight text-center uppercase">Confirm Walkover</h2>

              <div className="bg-red-50/50 rounded-xl p-4 border border-red-100 space-y-3">
                <div className="flex justify-between items-center pb-3 border-b border-red-100/50">
                  <span className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Result Type</span>
                  <span className="font-black text-red-600 text-[10px] uppercase bg-red-100 px-2 py-0.5 rounded">Walkover</span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-red-100/50">
                  <span className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Awarded Winner</span>
                  <span className="text-green-600 font-black text-xs uppercase">
                    {formData.walkoverWinner === matchDetails.player1.id ? matchDetails.player1?.name : matchDetails.player2?.name}
                  </span>
                </div>
                {formData.notes && (
                  <div className="flex justify-between items-start pt-1">
                    <span className="text-gray-400 text-[10px] font-black uppercase tracking-wider mt-1">Reason</span>
                    <span className="text-gray-600 text-[11px] font-medium text-right max-w-[200px] leading-relaxed">{formData.notes}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-6 border-t border-gray-100">
                <button onClick={prevStep} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-700 font-bold transition-colors">
                  <FaChevronLeft className="text-[9px]" /> Back
                </button>
                <Button
                  onClick={handleSubmit}
                  variant="primary"
                  loading={loading}
                  className="!bg-green-600 hover:!bg-green-700 border border-green-600 text-white !px-7 !py-2.5 !rounded-xl !font-black !text-sm uppercase tracking-widest shadow-xl shadow-green-600/20"
                >
                  <FaSave className="mr-2 inline" /> Submit Walkover
                </Button>
              </div>
            </div>
          );
        }

        // Regular match review
        return (
          <div className="space-y-6">
            <h2 className="text-lg font-black text-gray-900 tracking-tight text-center uppercase">Match Review</h2>

            <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <span className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Score Summary</span>
                <span className="font-black text-gray-900 text-xs">
                  {matchDetails.player1?.name} {formData.player1Score} - {formData.player2Score} {matchDetails.player2?.name}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Match Winner</span>
                <span className={`font-black uppercase text-[10px] px-2 py-0.5 rounded ${parseInt(formData.player1Score) === parseInt(formData.player2Score) ? 'text-amber-600 bg-amber-50' : 'text-green-600 bg-green-50'}`}>
                  {parseInt(formData.player1Score) === parseInt(formData.player2Score)
                    ? (formData.winnerId
                      ? `🤝 DRAW (${formData.winnerId === matchDetails.player1.id ? matchDetails.player1?.name : matchDetails.player2?.name} won tie-break)`
                      : '🤝 DRAW')
                    : (parseInt(formData.player1Score) > parseInt(formData.player2Score) ? matchDetails.player1?.name : matchDetails.player2?.name)}
                </span>
              </div>
            </div>

            {/* Frame-by-Frame Details Review */}
            {config?.scoreDetail === 'frame_by_frame' && formData.frameScores && formData.frameScores.length > 0 && (
              <div className="bg-blue-50 rounded-xl p-6">
                <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
                  <FaClipboard className="text-blue-600" /> Frame-by-Frame Results
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm bg-white rounded-lg overflow-hidden shadow-sm">
                    <thead className="bg-blue-100">
                      <tr>
                        <th className="p-3 text-left font-bold text-blue-900">Frame</th>
                        <th className="p-3 text-center font-bold text-blue-900">{matchDetails.player1?.name || 'Player 1'}</th>
                        <th className="p-3 text-center font-bold text-blue-900">{matchDetails.player2?.name || 'Player 2'}</th>
                        {matchDetails.sport === 'snooker' && (
                          <>
                            <th className="p-3 text-center font-bold text-blue-900">P1 Break</th>
                            <th className="p-3 text-center font-bold text-blue-900">P2 Break</th>
                          </>
                        )}
                        {matchDetails.sport === 'pooker' && (
                          <>
                            <th className="p-3 text-center font-bold text-blue-900">P1 Balls</th>
                            <th className="p-3 text-center font-bold text-blue-900">P2 Balls</th>
                            <th className="p-3 text-center font-bold text-blue-900">Black Finish</th>
                            <th className="p-3 text-center font-bold text-blue-900">7-Ball Win</th>
                          </>
                        )}
                        {matchDetails.sport === 'pool' && (
                          <>
                            <th className="p-3 text-center font-bold text-blue-900">P1 Balls</th>
                            <th className="p-3 text-center font-bold text-blue-900">P2 Balls</th>
                            <th className="p-3 text-center font-bold text-blue-900">7-Ball Win</th>
                          </>
                        )}
                        <th className="p-3 text-center font-bold text-blue-900">Winner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.frameScores
                        .map((frame, index) => {
                          const p1Score = parseInt(frame.player1Score) || 0;
                          const p2Score = parseInt(frame.player2Score) || 0;
                          const winner = p1Score > p2Score ? matchDetails.player1?.name : p2Score > p1Score ? matchDetails.player2?.name : 'Draw';
                          const winnerColor = p1Score > p2Score ? 'text-blue-600' : p2Score > p1Score ? 'text-red-600' : 'text-gray-600';

                          return (
                            <tr key={frame.frameNumber} className={index % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                              <td className="p-3 font-medium text-gray-700">#{frame.frameNumber}</td>
                              <td className="p-3 text-center font-bold text-blue-600">{frame.player1Score || '0'}</td>
                              <td className="p-3 text-center font-bold text-red-600">{frame.player2Score || '0'}</td>
                              {matchDetails.sport === 'snooker' && (
                                <>
                                  <td className="p-3 text-center text-blue-600">{frame.player1Break || '0'}</td>
                                  <td className="p-3 text-center text-red-600">{frame.player2Break || '0'}</td>
                                </>
                              )}
                              {matchDetails.sport === 'pooker' && (
                                <>
                                  <td className="p-3 text-center text-blue-600">{frame.player1BallsPotted || '0'}</td>
                                  <td className="p-3 text-center text-red-600">{frame.player2BallsPotted || '0'}</td>
                                  <td className="p-3 text-center text-purple-600">{frame.isBlackFinish ? 'Yes' : '-'}</td>
                                  <td className="p-3 text-center text-indigo-600">{frame.isSevenBallWin ? 'Yes' : '-'}</td>
                                </>
                              )}
                              {matchDetails.sport === 'pool' && (
                                <>
                                  <td className="p-3 text-center text-blue-600">{frame.player1BallsPotted || '0'}</td>
                                  <td className="p-3 text-center text-red-600">{frame.player2BallsPotted || '0'}</td>
                                  <td className="p-3 text-center text-purple-600">{frame.isSevenBallWin ? 'Yes' : '-'}</td>
                                </>
                              )}
                              <td className={`p-3 text-center font-bold ${winnerColor}`}>{winner}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 text-sm text-blue-700 bg-blue-100 p-3 rounded-lg">
                  <strong>Summary:</strong> {matchDetails.player1?.name} won {formData.player1Score} frames, {matchDetails.player2?.name} won {formData.player2Score} frames
                </div>
              </div>
            )}

            {matchDetails?.league?.reporting?.photoProof && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider flex items-center gap-2">
                  Photo Proof
                  <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-black">Required</span>
                </label>
                <div className="flex items-center gap-6">
                  <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50/50 hover:border-gray-300 transition-all group">
                    <div className="flex flex-col items-center justify-center pt-4 pb-5">
                      {previewImage ? (
                        <img src={previewImage} alt="Preview" className="h-28 object-contain rounded-lg shadow-sm" />
                      ) : (
                        <>
                          <FaFileUpload className="text-2xl text-gray-300 mb-2 group-hover:text-gray-400 transition-colors" />
                          <p className="mb-1 text-[11px] text-gray-400 font-black uppercase tracking-wider">Upload Proof</p>
                          <p className="text-[9px] text-gray-300 font-medium">PNG, JPG up to 10MB</p>
                        </>
                      )}
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                  </label>
                  {previewImage && (
                    <button onClick={() => { setPreviewImage(null); setFormData(p => ({ ...p, resultImage: null })) }} className="text-red-400 hover:text-red-600 transition-colors">
                      <FaTimes className="text-lg" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Additional Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                className="w-full border-2 border-gray-100 rounded-xl p-3 text-xs font-medium focus:border-[#132F45] focus:outline-none bg-gray-50/30"
                placeholder="Any notable breaks or match events..."
                rows="2"
              />
            </div>

            <div className="flex justify-between pt-6 border-t border-gray-100 mt-4">
              <button onClick={prevStep} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-700 font-bold transition-colors">
                <FaChevronLeft className="text-[9px]" /> Back
              </button>
              <Button
                onClick={handleSubmit}
                variant="primary"
                loading={loading}
                className="!bg-red-600 hover:!bg-red-700 text-white !px-7 !py-2.5 !rounded-xl !font-black !text-sm uppercase tracking-wider shadow-xl shadow-red-500/20"
              >
                <FaSave className="mr-2 inline" /> Submit Result
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const STEPS = [
    { n: 1, label: 'Sport' },
    { n: 2, label: 'League' },
    { n: 3, label: 'Match' },
    { n: 4, label: 'Type' },
    { n: 5, label: 'Score' },
    { n: 6, label: 'Review' },
  ];

  const initialLoading = loadingGames || loadingContexts || loadingBookings;

  if (initialLoading) {
    return (
      <Loader
        text={
          loadingGames ? "Loading sports..." :
            loadingContexts ? `Fetching ${formData.contextType}s...` :
              "Retrieving matches..."
        }
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] relative">
      {loading && <Loader text="Submitting result..." />}

      {/* Hero Header */}
      <div className="bg-[#132F45] pt-5 pb-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="text-[7.5px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-2.5 flex items-center gap-2.5">
            <div className="w-5 h-[1px] bg-[#BA995D]" /> Match Reporting
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">
            Report <span className="text-[#BA995D]">Score</span>
          </h1>
          <p className="text-white/30 font-black text-[7.5px] uppercase tracking-[0.2em] mt-3 max-w-md leading-relaxed">
            Record your match results for official league standings.
          </p>
        </div>
      </div>

      {/* Step progress bar */}
      <div className="bg-white border-b border-gray-100 shadow-xl shadow-[#132F45]/5 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5">
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.n}>
                <div className="flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[7px] font-black border-2 transition-all duration-500 ${currentStep > s.n
                      ? 'bg-[#BA995D] border-[#BA995D] text-white shadow-lg shadow-[#BA995D]/10'
                      : currentStep === s.n
                        ? 'bg-[#132F45] border-[#132F45] text-white shadow-xl shadow-[#132F45]/20 scale-105'
                        : 'bg-white border-gray-100 text-gray-300'
                    }`}>
                    {currentStep > s.n ? <FaCheckCircle className="text-[8px]" /> : s.n}
                  </div>
                  <span className={`text-[6px] font-black uppercase tracking-widest mt-1 hidden sm:block ${currentStep >= s.n ? 'text-[#132F45]' : 'text-gray-300'
                    }`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 rounded-full transition-all duration-700 ${currentStep > s.n ? 'bg-[#BA995D]' : 'bg-gray-100'
                    }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 font-medium">
        <div className="bg-white rounded-2xl shadow-xl shadow-[#132F45]/5 border border-gray-50 overflow-hidden outline outline-1 outline-[#FDF2D1]">
          <div className="p-5 sm:p-6">
            {renderStep()}
          </div>
        </div>
      </div>
    </div>
  );
}
