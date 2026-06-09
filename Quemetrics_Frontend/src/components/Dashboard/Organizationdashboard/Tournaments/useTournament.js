// src/components/Dashboard/Organizationdashboard/Tournaments/useTournament.js
// Custom hook for tournament management

import { useState, useCallback } from 'react';
import api from '../../../../contexts/apiClient';

/** Normalize API boolean fields (MySQL/SQLite may return 0/1; strings are ambiguous). */
function coerceBoolean(value) {
  if (value === undefined || value === null) return false;
  if (typeof globalThis !== 'undefined' && globalThis.Buffer && globalThis.Buffer.isBuffer(value)) {
    return value[0] === 1;
  }
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'true' || s === 'yes') return true;
    if (s === 'false' || s === 'no' || s === '') return false;
  }
  return Boolean(value);
}

// Helper function to parse JSON string fields
const parseTournamentData = (tournament) => {
  const parsed = { ...tournament };
  const jsonFields = ['entryMethods', 'withdrawalRules', 'rankingPointsPerRound', 'privacySettings', 'rankingScope', 'setupCompletedSteps'];

  jsonFields.forEach(field => {
    if (parsed[field] && typeof parsed[field] === 'string') {
      try {
        parsed[field] = JSON.parse(parsed[field]);
      } catch (e) {
        console.warn(`Failed to parse ${field}:`, e);
      }
    }
  });

  if (Object.prototype.hasOwnProperty.call(parsed, 'ranked')) {
    parsed.ranked = coerceBoolean(parsed.ranked);
  }

  return parsed;
};

export const useTournament = () => {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getTournaments = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const response = await api.get('/tournaments', { params: filters });
      const parsedTournaments = response.data.data.map(parseTournamentData);
      setTournaments(parsedTournaments);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch tournaments');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createTournament = useCallback(async (tournamentData) => {
    setLoading(true);
    try {
      const response = await api.post('/tournaments', tournamentData);
      const parsedData = parseTournamentData(response.data.data);
      setTournaments((prev) => [...prev, parsedData]);
      setError(null);
      return parsedData;
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to create tournament';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateTournament = useCallback(async (tournamentId, updates) => {
    setLoading(true);
    try {
      const response = await api.put(`/tournaments/${tournamentId}`, updates);
      const parsedData = parseTournamentData(response.data.data);
      setTournaments((prev) =>
        prev.map((t) => (t.id === tournamentId ? parsedData : t))
      );
      setError(null);
      return parsedData;
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to update tournament';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const registerForTournament = useCallback(async (tournamentId, registrationData) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/register`, registrationData);
      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to register';
      throw new Error(errorMsg);
    }
  }, []);

  const generateJoinCode = useCallback(async (tournamentId, config = {}) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/join-code`, config);
      return response.data.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to generate join code');
    }
  }, []);

  const createInvitations = useCallback(async (tournamentId, invitationData) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/invitations`, invitationData);
      // Return the entire response object including data, emailResults, and message
      console.log('[useTournament] createInvitations response:', response.data);
      return response.data;
    } catch (err) {
      console.error('[useTournament] createInvitations error:', err);
      throw new Error(err.response?.data?.error || 'Failed to create invitations');
    }
  }, []);

  const generateBracket = useCallback(async (tournamentId, body = {}) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/generate-bracket`, body);
      return response.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to generate bracket');
    }
  }, []);

  const closeRegistration = useCallback(async (tournamentId, body = {}) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/close-registration`, body);
      return response.data.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to close registration');
    }
  }, []);

  const getParticipants = useCallback(async (tournamentId, filters = {}) => {
    try {
      const response = await api.get(`/tournaments/${tournamentId}/participants`, {
        params: filters,
      });
      return response.data.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to fetch participants');
    }
  }, []);

  const approveParticipant = useCallback(async (tournamentId, participantId, approve = true) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/participants/${participantId}/approve`, {
        approve,
      });
      return response.data.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to approve participant');
    }
  }, []);

  const getTournamentMatches = useCallback(async (tournamentId, filters = {}) => {
    try {
      const response = await api.get(`/tournaments/${tournamentId}/matches`, {
        params: filters,
      });
      return {
        matches: response.data.data,
        groupStageView: response.data.groupStageView || null,
      };
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to fetch matches');
    }
  }, []);

  const getTournamentStandings = useCallback(async (tournamentId) => {
    try {
      const response = await api.get(`/tournaments/${tournamentId}/standings`);
      const standingsData = response.data.data || [];

      // Sort standings by points (descending), then by frame difference, then frames won
      const sortedStandings = [...standingsData].sort((a, b) => {
        // Primary sort: points (highest first)
        if ((b.points || 0) !== (a.points || 0)) {
          return (b.points || 0) - (a.points || 0);
        }
        // Secondary sort: frame difference (highest first)
        const frameDiffA = (a.framesWon || 0) - (a.framesLost || 0);
        const frameDiffB = (b.framesWon || 0) - (b.framesLost || 0);
        if (frameDiffB !== frameDiffA) {
          return frameDiffB - frameDiffA;
        }
        // Tertiary sort: frames won (highest first)
        if ((b.framesWon || 0) !== (a.framesWon || 0)) {
          return (b.framesWon || 0) - (a.framesWon || 0);
        }
        // Quaternary sort: highest break (highest first)
        return (b.highestBreak || 0) - (a.highestBreak || 0);
      });

      return sortedStandings;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to fetch standings');
    }
  }, []);

  const getWithdrawalsFeed = useCallback(async () => {
    try {
      const response = await api.get('/tournaments/withdrawals-feed');
      return response.data.data || [];
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to load withdrawals');
    }
  }, []);

  const generateNextRound = useCallback(async (tournamentId, body = {}) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/generate-next-round`, body);
      return response.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to generate next round');
    }
  }, []);

  const submitMatchResult = useCallback(async (tournamentId, resultData) => {
    try {
      const response = await api.post(
        `/tournaments/${tournamentId}/matches/${resultData.matchId}/result`,
        resultData
      );
      return response.data.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to submit match result');
    }
  }, []);

  const confirmMatchResult = useCallback(async (tournamentId, matchId, confirmed = true) => {
    try {
      const response = await api.post(
        `/tournaments/${tournamentId}/matches/${matchId}/confirm`,
        { confirmed }
      );
      return response.data.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to confirm match result');
    }
  }, []);

  const rejectParticipant = useCallback(async (tournamentId, participantId) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/participants/${participantId}/approve`, { approve: false });
      return response.data.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to reject participant');
    }
  }, []);

  const removeParticipant = useCallback(async (participantId) => {
    try {
      const response = await api.delete(`/tournaments/participants/${participantId}`);
      return response.data.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to remove participant');
    }
  }, []);

  const completeTournament = useCallback(async (tournamentId) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/complete`);
      return response.data.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to complete tournament');
    }
  }, []);

  const overrideMatchResult = useCallback(async (tournamentId, matchId, overrideData) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/matches/${matchId}/override`, overrideData);
      return response.data.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to override result');
    }
  }, []);

  const disputeMatch = useCallback(async (tournamentId, matchId, disputeData) => {
    try {
      const response = await api.post(
        `/tournaments/${tournamentId}/matches/${matchId}/dispute`,
        disputeData
      );
      return response.data.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to dispute match');
    }
  }, []);

  const autoForfeitOverdue = useCallback(async (tournamentId) => {
    try {
      const response = await api.post(`/tournaments/${tournamentId}/auto-forfeit`);
      return { success: true, data: response.data.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to auto-forfeit overdue matches' };
    }
  }, []);

  const exportParticipantsAsPDF = useCallback(async (tournamentId) => {
    try {
      const response = await api.get(`/tournaments/${tournamentId}/participants/export`, {
        responseType: 'blob',
      });

      // Create a blob URL and trigger download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tournament_participants_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return true;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to export participants');
    }
  }, []);

  const getMyClubs = useCallback(async () => {
    try {
      const response = await api.get('/clubs/my-clubs');
      return response.data.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to fetch clubs';
      throw new Error(errorMsg);
    }
  }, []);

  const getTournamentById = useCallback(async (tournamentId) => {
    try {
      const response = await api.get(`/tournaments/${tournamentId}`);
      return parseTournamentData(response.data.data);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to fetch tournament';
      throw new Error(errorMsg);
    }
  }, []);

  const getAllVenues = useCallback(async () => {
    try {
      // Use multi-organizer venue endpoint (includes ownership + requiresApproval)
      const response = await api.get('/organization/venues/all');
      const rawVenues = response.data?.data || [];

      // The backend `Tournament.createTournament()` expects `venueIds` to be `VenueOwner.id` (UUID).
      // Your `/organization/venues/all` endpoint returns composite ids like:
      //   "<venueOwnerId>:<venueId>"
      // so we strip the prefix and normalize to `{ id, name, address, organizationId }`.
      const normalizedByVenueOwnerId = new Map();
      rawVenues.forEach((v) => {
        // Include owned venues even if legacy club venues (canCreateLeagueRequest === false)
        // Only exclude external venues that cannot create approval requests
        if (v?.canCreateLeagueRequest === false && v?.isOwner !== true) return;

        const venueOwnerId = typeof v?.id === "string" ? v.id.split(":")[0] : v?.id;
        if (!venueOwnerId) return;

        if (!normalizedByVenueOwnerId.has(venueOwnerId)) {
          normalizedByVenueOwnerId.set(venueOwnerId, {
            ...v,
            id: venueOwnerId,
            // Tournament wizard uses `organizationId` to decide "Your Venue" vs "Other Organizer Venue".
            organizationId: v.ownerOrganizationId || v.organizationId,
          });
        }
      });

      return Array.from(normalizedByVenueOwnerId.values());
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to fetch venues';
      throw new Error(errorMsg);
    }
  }, []);

  /**
   * Validate ranking configuration and get tier-based presets
   */
  const validateRankingConfig = useCallback(async (config) => {
    try {
      const response = await api.post('/tournaments/validate-ranking-config', config);
      return response.data;
    } catch (err) {
      console.error('Failed to validate ranking config:', err);
      return {
        success: false,
        valid: false,
        errors: [err.response?.data?.error || 'Validation failed'],
        warnings: [],
        recommendations: [],
        tierPresets: null
      };
    }
  }, []);

  return {
    tournaments,
    loading,
    error,
    getTournaments,
    createTournament,
    updateTournament,
    getTournamentById,
    registerForTournament,
    generateJoinCode,
    createInvitations,
    generateBracket,
    closeRegistration,
    getParticipants,
    approveParticipant,
    rejectParticipant,
    removeParticipant,
    getTournamentMatches,
    getTournamentStandings,
    generateNextRound,
    submitMatchResult,
    confirmMatchResult,
    completeTournament,
    overrideMatchResult,
    disputeMatch,
    autoForfeitOverdue,
    exportParticipantsAsPDF,
    getMyClubs,
    getAllVenues,
    getWithdrawalsFeed,
    validateRankingConfig,
  };
};
