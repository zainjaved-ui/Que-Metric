import apiClient from '../contexts/apiClient';

/**
 * Match Result Service
 * Handles all API calls for the match result submission workflow
 */

// ============================================
// STEP 1: GET AVAILABLE GAMES
// ============================================
/**
 * Fetch available games (Snooker, Pool, Poker)
 * @returns {Promise} API response with games list
 */
export const getAvailableGames = async () => {
  try {
    const response = await apiClient.get('/match-results/games');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// ============================================
// STEP 2: GET LEAGUES OR TOURNAMENTS BY GAME
// ============================================
/**
 * Fetch leagues by game ID
 * @param {number} gameId - The ID of the selected game
 * @param {boolean} showAll - Optional: if true, shows all public leagues (for discovery); if false, shows only member leagues
 * @returns {Promise} API response with leagues list
 */
export const getLeaguesByGame = async (gameId, showAll = false) => {
  try {
    const query = showAll ? '?showAll=true' : '';
    const response = await apiClient.get(`/match-results/leagues/game/${gameId}${query}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Fetch tournaments by game ID
 * @param {number} gameId - The ID of the selected game
 * @returns {Promise} API response with tournaments list
 */
export const getTournamentsByGame = async (gameId) => {
  try {
    const response = await apiClient.get(`/match-results/tournaments/game/${gameId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// ============================================
// STEP 3: GET BOOKINGS FOR LEAGUE OR TOURNAMENT
// ============================================
/**
 * Fetch confirmed and unscored bookings for a specific league
 * @param {number} leagueId - The ID of the selected league
 * @returns {Promise} API response with bookings list
 */
export const getLeagueBookings = async (leagueId) => {
  try {
    const response = await apiClient.get(`/match-results/bookings/league/${leagueId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Fetch confirmed and unscored bookings for a specific tournament
 * @param {number} tournamentId - The ID of the selected tournament
 * @returns {Promise} API response with bookings list
 */
export const getTournamentBookings = async (tournamentId) => {
  try {
    const response = await apiClient.get(`/match-results/bookings/tournament/${tournamentId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// ============================================
// STEP 4: GET COMPLETE MATCH DETAILS
// ============================================
/**
 * Fetch complete match details for a specific booking
 * Includes player information and match configuration
 * @param {number} bookingId - The ID of the selected booking
 * @returns {Promise} API response with match details
 */
export const getBookingDetails = async (bookingId) => {
  try {
    const response = await apiClient.get(`/match-results/booking/${bookingId}/details`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// ============================================
// STEP 5: SUBMIT MATCH RESULT
// ============================================
/**
 * Submit match result with "Pending" status
 * @param {Object|FormData} resultData - The match result data to submit (can be object or FormData with file)
 * @param {number} resultData.bookingId - Booking ID
 * @param {number} resultData.winnerId - Winner player ID
 * @param {number} resultData.loserId - Loser player ID
 * @param {number} resultData.winnerScore - Winner's score
 * @param {number} resultData.loserScore - Loser's score
 * @param {Array} resultData.frameScores - Frame-by-frame scores (for Snooker/Pool)
 * @param {Object} resultData.pokerResult - Poker-specific result data
 * @param {string} resultData.notes - Optional match notes
 * @param {File} resultData.resultImage - Optional image file (for FormData)
 * @returns {Promise} API response
 */
export const submitMatchResult = async (resultData) => {
  try {
    // Check if resultData is FormData (for image uploads)
    const isFormData = resultData instanceof FormData;

    const config = isFormData ? {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    } : {};

    const response = await apiClient.post('/match-results/submit', resultData, config);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// ============================================
// STEP 6: CONFIRM MATCH RESULT
// ============================================
/**
 * Confirm match result (opponent confirms)
 * Updates result status to "Confirmed" and booking status to "Completed"
 * @param {number} resultId - The ID of the result to confirm
 * @param {boolean} confirmed - True to confirm, false to dispute
 * @returns {Promise} API response
 */
export const confirmMatchResult = async (resultId, confirmed = true) => {
  try {
    const response = await apiClient.put(`/match-results/${resultId}/confirm`, { confirmed });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// ============================================
// UTILITY ROUTES
// ============================================
/**
 * Fetch all pending results waiting for player's confirmation
 * @returns {Promise} API response with pending results
 */
export const getPendingResults = async () => {
  try {
    const response = await apiClient.get('/match-results/pending');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Fetch all results submitted by the logged-in player
 * @returns {Promise} API response with submitted results
 */
export const getMySubmittedResults = async () => {
  try {
    const response = await apiClient.get('/match-results/my-submissions');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Fetch all completed/confirmed results for the logged-in player
 * @returns {Promise} API response with completed results
 */
export const getCompletedResults = async () => {
  try {
    const response = await apiClient.get('/match-results/completed');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// ============================================
// PLAYER NOTIFICATIONS
// ============================================
/**
 * Get all notifications for logged-in player
 * @returns {Promise} API response with notifications, count, and unreadCount
 */
export const getPlayerNotifications = async () => {
  try {
    const response = await apiClient.get('/match-results/notifications');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Mark a notification as read
 * @param {string} notificationId - Notification ID
 * @returns {Promise} API response
 */
export const markNotificationRead = async (notificationId) => {
  try {
    const response = await apiClient.put(`/match-results/notifications/${notificationId}/read`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Confirm or dispute a match result
 * @param {string} resultId - Match result ID
 * @param {boolean} confirmed - True to confirm, false to dispute
 * @param {string} disputeReason - Reason for dispute (required if confirmed=false)
 * @returns {Promise} API response
 */
export const confirmOrDisputeResult = async (resultId, confirmed, disputeReason = '', claimedScore = null) => {
  try {
    const payload = { confirmed };
    if (!confirmed) {
      if (disputeReason) payload.disputeReason = disputeReason;
      if (claimedScore) payload.claimedScore = claimedScore;
    }
    const response = await apiClient.put(`/match-results/${resultId}/confirm`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Get all unique game types (sports) used in an organization's leagues and tournaments
 * @returns {Promise} API response with list of sports
 */
export const getOrganizationGameTypes = async () => {
  try {
    const response = await apiClient.get('/match-results/get-game-types');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Get disputes filtered by sport (game type)
 * @param {string} sport - snooker | pool | poker
 * @returns {Promise} API response with disputed matches
 */
export const getDisputesBySport = async (sport) => {
  try {
    const response = await apiClient.get(`/match-results/disputes/sport/${sport}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Get leagues that contain disputes (for filtering)
 * @param {string} sport - snooker | pool | poker
 * @returns {Promise} API response with leagues that have disputes
 */
export const getLeaguesWithDisputes = async (sport) => {
  try {
    const response = await apiClient.get(`/match-results/disputes/leagues/${sport}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Get all disputed matches for a specific league
 * @param {string} leagueId - League ID
 * @returns {Promise} API response with disputed matches for the league
 */
export const getDisputesByLeague = async (leagueId) => {
  try {
    const response = await apiClient.get(`/match-results/disputes/league/${leagueId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Get full details of a specific dispute for review
 * @param {string} disputeId - Dispute ID
 * @returns {Promise} API response with complete dispute details
 */
export const getDisputeDetails = async (disputeId) => {
  try {
    const response = await apiClient.get(`/match-results/disputes/${disputeId}/details`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Resolve a dispute with final scores
 * @param {string} disputeId - Dispute ID
 * @param {Object} resolutionData - Resolution data
 * @param {string} resolutionData.finalWinnerId - Final winner ID
 * @param {number} resolutionData.finalPlayer1Frames - Final frames for player 1 (Snooker)
 * @param {number} resolutionData.finalPlayer2Frames - Final frames for player 2 (Snooker)
 * @param {Array} resolutionData.finalSnookerFrameDetails - Final frame details (Snooker)
 * @param {number} resolutionData.finalPlayer1RackWins - Final racks for player 1 (Pool)
 * @param {number} resolutionData.finalPlayer2RackWins - Final racks for player 2 (Pool)
 * @param {Array} resolutionData.finalPoolRackDetails - Final rack details (Pool)
 * @param {Object} resolutionData.finalPokerResults - Final poker results (Poker)
 * @param {string} resolutionData.resolutionNotes - Admin notes about the resolution
 * @returns {Promise} API response
 */
export const resolveDispute = async (disputeId, resolutionData) => {
  try {
    const response = await apiClient.put(`/match-results/disputes/${disputeId}/resolve`, resolutionData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// ============================================
// ADMIN MATCH APPROVAL
// ============================================
/**
 * Fetch all results awaiting admin approval
 * @returns {Promise} API response with results
 */
export const getResultsAwaitingAdminApproval = async () => {
  try {
    const response = await apiClient.get('/match-results/admin/awaiting-approval');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Admin approves a match result
 * @param {string} resultId - Result ID
 * @param {string} adminNotes - Optional admin notes
 * @returns {Promise} API response
 */
export const approveMatchResult = async (resultId, adminNotes = '') => {
  try {
    const response = await apiClient.put(`/match-results/admin/${resultId}/approve`, { adminNotes });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Admin approves/rejects a walkover result
 * @param {string} resultId - Result ID
 * @param {string} action - 'approve' or 'reject'
 * @param {string} rejectionReason - Optional reason for rejection (required if action='reject')
 * @returns {Promise} API response
 */
export const approveRejectWalkover = async (resultId, action, rejectionReason = '', customWalkoverScore = null) => {
  try {
    const payload = { action };
    if (action === 'reject') {
      payload.rejectionReason = rejectionReason;
    }
    if (action === 'approve' && customWalkoverScore) {
      payload.customWalkoverScore = customWalkoverScore;
    }
    const response = await apiClient.put(`/match-results/admin/${resultId}/walkover`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Fetch all pending walkovers for a league (for organization admin approval)
 * @param {string} leagueId - League ID
 * @returns {Promise} API response with pending walkovers
 */
export const getPendingWalkoversForLeague = async (leagueId) => {
  try {
    const response = await apiClient.get(`/match-results/pending-walkovers/league/${leagueId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// Default export with all functions
export default {
  // Workflow functions
  getAvailableGames,
  getLeaguesByGame,
  getTournamentsByGame,
  getLeagueBookings,
  getTournamentBookings,
  getBookingDetails,
  submitMatchResult,
  confirmMatchResult,

  // Player utility functions
  getPendingResults,
  getMySubmittedResults,
  getCompletedResults,

  // Player notification functions
  getPlayerNotifications,
  markNotificationRead,
  confirmOrDisputeResult,

  // Organization dispute management functions
  getDisputesBySport,
  getLeaguesWithDisputes,
  getDisputesByLeague,
  getDisputeDetails,
  resolveDispute,
  getOrganizationGameTypes,

  // Admin approval functions
  getResultsAwaitingAdminApproval,
  approveMatchResult,
  approveRejectWalkover,
  getPendingWalkoversForLeague,
};

// ============================================
// TOURNAMENT RESULTS (for Results page)
// ============================================

/**
 * Get tournament matches awaiting player's confirmation
 * @returns {Promise} API response with pending tournament results
 */
export const getPlayerPendingTournamentResults = async () => {
  try {
    const response = await apiClient.get('/tournaments/player-results/pending');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Get tournament matches submitted by player
 * @returns {Promise} API response with submitted tournament results
 */
export const getPlayerSubmittedTournamentResults = async () => {
  try {
    const response = await apiClient.get('/tournaments/player-results/submitted');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Get completed tournament matches for player
 * @returns {Promise} API response with completed tournament results
 */
export const getPlayerCompletedTournamentResults = async () => {
  try {
    const response = await apiClient.get('/tournaments/player-results/completed');
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};
