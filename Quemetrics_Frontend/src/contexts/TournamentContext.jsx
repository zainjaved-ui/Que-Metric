import { createContext, useState, useCallback } from 'react';
import apiClient from './apiClient';

const tournamentAPI = {
  getTournaments: (params) => apiClient.get('/tournaments', { params }),
  getTournamentById: (id) => apiClient.get(`/tournaments/${id}`),
  createTournament: (data) => apiClient.post('/tournaments', data),
  updateTournament: (id, data) => apiClient.put(`/tournaments/${id}`, data),
  deleteTournament: (id) => apiClient.delete(`/tournaments/${id}`),
  registerForTournament: (id, data) => apiClient.post(`/tournaments/${id}/register`, data),
  registerWithJoinCode: (data) => apiClient.post('/tournaments/register-with-code', data),
  closeRegistration: (id) => apiClient.post(`/tournaments/${id}/close-registration`),
  getRankings: (params) => apiClient.get('/tournaments/rankings', { params }),
  getRankingHistory: (playerId, params) => apiClient.get(`/tournaments/rankings/${playerId}/history`, { params }),
  getTournamentStandings: (id, params) => apiClient.get(`/tournaments/${id}/standings`, { params }),
  withdrawPlayer: (id, data) => apiClient.post(`/tournaments/${id}/withdraw`, data),
  getWithdrawalInfo: (id) => apiClient.get(`/tournaments/${id}/withdrawal-info`),
};

export const TournamentContext = createContext();

// Helper function to parse JSON fields from database
const parseJSONFields = (tournament) => {
  if (!tournament) return tournament;

  const fieldsToParseArray = ['entryMethods', 'withdrawalRules', 'rankingPointsPerRound', 'rankingScope', 'venueIds', 'sportTypes'];
  const fieldsToParseObj = ['rankingPointsPerRound'];

  const parsed = { ...tournament };

  fieldsToParseArray.forEach(field => {
    if (parsed[field] && typeof parsed[field] === 'string') {
      try {
        parsed[field] = JSON.parse(parsed[field]);
      } catch (e) {
        console.warn(`Could not parse ${field}:`, e);
      }
    }
  });

  return parsed;
};

export function TournamentProvider({ children }) {
  // ============================================================================
  // STATE
  // ============================================================================
  const [tournaments, setTournaments] = useState([]);
  const [currentTournament, setCurrentTournament] = useState(null);
  const [bracketStatus, setBracketStatus] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getTournaments = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await tournamentAPI.getTournaments(params);
      setTournaments(data.data);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  }, []);

  const getTournamentById = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await tournamentAPI.getTournamentById(id);
      setCurrentTournament(data.data);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  }, []);

  const createTournament = async (tournamentData) => {
    try {
      const { data } = await tournamentAPI.createTournament(tournamentData);
      setTournaments((prev) => [data.data, ...prev]);
      return { success: true, message: 'Tournament created successfully', data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const updateTournament = async (id, updateData) => {
    try {
      const { data } = await tournamentAPI.updateTournament(id, updateData);
      setTournaments((prev) => prev.map((t) => (t.id === id ? data.data : t)));
      setCurrentTournament(data.data);
      return { success: true, message: 'Tournament updated successfully' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const deleteTournament = useCallback(async (id) => {
    try {
      await tournamentAPI.deleteTournament(id);
      setTournaments((prev) => prev.filter((t) => t.id !== id));
      if (currentTournament?.id === id) {
        setCurrentTournament(null);
      }
      return { success: true, message: 'Tournament deleted successfully' };
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to delete tournament';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [currentTournament?.id]);

  // ============================================================================
  // REGISTRATION OPERATIONS (3 methods)
  // ============================================================================

  const registerForTournament = useCallback(async (tournamentId, playerData) => {
    setError(null);
    try {
      const { data } = await tournamentAPI.registerForTournament(tournamentId, playerData);
      setParticipants((prev) => [data.data, ...prev]);
      return { success: true, message: 'Registered successfully', data: data.data };
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Registration failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, []);

  const registerWithJoinCode = useCallback(async (joinCodeData) => {
    setError(null);
    try {
      const { data } = await tournamentAPI.registerWithJoinCode(joinCodeData);
      setParticipants((prev) => [data.data, ...prev]);
      return { success: true, message: 'Registered successfully with join code', data: data.data };
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Registration with join code failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, []);

  const closeRegistration = useCallback(async (tournamentId) => {
    setError(null);
    try {
      const { data } = await tournamentAPI.closeRegistration(tournamentId);
      const parsed = parseJSONFields(data.data);
      setCurrentTournament(parsed);
      return { success: true, message: 'Registration closed', data: parsed };
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to close registration';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, []);

  const getRankings = useCallback(async (params = {}) => {
    try {
      const { data } = await tournamentAPI.getRankings(params);
      return {
        success: Boolean(data?.success),
        data: data?.data,
        error: data?.error,
      };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.error || err.message || 'Failed to load rankings',
      };
    }
  }, []);

  const getRankingHistory = useCallback(async (playerId, params = {}) => {
    try {
      const { data } = await tournamentAPI.getRankingHistory(playerId, params);
      return {
        success: Boolean(data?.success),
        data: data?.data ?? [],
        error: data?.error,
      };
    } catch (err) {
      return {
        success: false,
        data: [],
        error: err.response?.data?.error || err.message,
      };
    }
  }, []);

  const getTournamentStandings = useCallback(async (tournamentId, params = {}) => {
    setError(null);
    try {
      const { data } = await tournamentAPI.getTournamentStandings(tournamentId, params);
      if (data.success) {
        setStandings(data.data || []);
      }
      return {
        success: Boolean(data?.success),
        data: data?.data || [],
        standingsDisplay: data?.standingsDisplay || null,
        error: data?.error,
      };
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to load standings';
      setError(errorMsg);
      return {
        success: false,
        data: [],
        standingsDisplay: null,
        error: errorMsg,
      };
    }
  }, []);

  const withdrawPlayer = useCallback(async (tournamentId, data = {}) => {
    setError(null);
    try {
      const { data: resp } = await tournamentAPI.withdrawPlayer(tournamentId, data);
      // Refresh tournament list to reflect withdrawn status
      return { success: true, data: resp.data, message: resp.message };
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Withdrawal failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, []);

  const getWithdrawalInfo = useCallback(async (tournamentId) => {
    try {
      const { data } = await tournamentAPI.getWithdrawalInfo(tournamentId);
      return { success: Boolean(data?.success), data: data?.data };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.error || err.message || 'Failed to load withdrawal info',
      };
    }
  }, []);

  const value = {
    tournaments,
    currentTournament,
    bracketStatus,
    participants,
    matches,
    standings,
    loading,
    error,

    // CRUD
    getTournaments,
    getTournamentById,
    createTournament,
    updateTournament,
    deleteTournament,

    registerForTournament,
    registerWithJoinCode,
    closeRegistration,
    getRankings,
    getRankingHistory,
    getTournamentStandings,
    withdrawPlayer,
    getWithdrawalInfo,
  };

  return (
    <TournamentContext.Provider value={value}>
      {children}
    </TournamentContext.Provider>
  );
}
