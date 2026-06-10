import { createContext, useState, useCallback, useContext, useEffect, useRef, useMemo } from 'react';
import apiClient from './apiClient';
import { AuthContext } from './AuthContext';

export const LeagueContext = createContext();

export const useLeague = () => useContext(LeagueContext);

export function LeagueProvider({ children }) {
  const [leagues, setLeagues] = useState([]);
  const [currentLeague, setCurrentLeague] = useState(null);
  const [loadingStates, setLoadingStates] = useState({
    list: false,     // getLeagues, getPublicLeagues
    detail: false,   // getLeagueById
    action: false,   // startLeague, publishLeague, generateFixtures, deleteLeague, etc.
    wizard: false,   // getWizardClubs, getWizardGameSeasons, createWizardLeague, etc.
    players: false,  // getLeaguePlayers, getAllPlayers, addPlayerToLeague
  });
  const lastUserIdRef = useRef(null);

  // Derive global loading for backward compatibility with components using 'loading'
  const loading = Object.values(loadingStates).some(Boolean);

  const setGlobalLoading = (key, val) => {
    setLoadingStates(prev => ({ ...prev, [key]: val }));
  };

  // Clear league state on logout or user switch
  const auth = useContext(AuthContext);
  const user = auth?.user;
  useEffect(() => {
    if (!user) {
      setLeagues([]);
      setCurrentLeague(null);
      lastUserIdRef.current = null;
      return;
    }
    if (lastUserIdRef.current && lastUserIdRef.current !== user.id) {
      setLeagues([]);
      setCurrentLeague(null);
    }
    lastUserIdRef.current = user.id;
  }, [user]);

  const getLeagues = useCallback(async (params = {}) => {
    const { signal, ...rest } = params;
    setGlobalLoading('list', true);
    try {
      const { data } = await apiClient.get('/leagues', { params: rest, signal });
      setLeagues(data.data);
      return { success: true, data: data.data };
    } catch (error) {
      if (error.name === 'CanceledError') return { success: false, cancelled: true };
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('list', false);
    }
  }, []);

  const getLeagueById = useCallback(async (id) => {
    setGlobalLoading('detail', true);
    try {
      const { data } = await apiClient.get(`/leagues/${id}`);
      setCurrentLeague(data.data);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('detail', false);
    }
  }, []);

  const startLeague = useCallback(async (id) => {
    setGlobalLoading('action', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${id}/start`);
      return { success: true, message: response.message || 'League started successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to start league' };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const createLeague = useCallback(async (leagueData) => {
    setGlobalLoading('action', true);
    try {
      const { data } = await apiClient.post('/leagues', leagueData);
      const league = {
        ...data.data,
        ...(data.data.venueApprovalRequestId
          ? { venueApprovalStatus: 'pending', isVenueApprovalPending: true }
          : {})
      };
      setLeagues((prev) => [league, ...prev]);
      return { success: true, message: 'League created successfully', data: league };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const updateLeague = useCallback(async (id, updateData) => {
    setGlobalLoading('action', true);
    try {
      const { data } = await apiClient.put(`/leagues/${id}`, updateData);
      setLeagues((prev) => prev.map((l) => (l.id === id ? data.data : l)));
      setCurrentLeague(data.data);
      return { success: true, message: 'League updated successfully' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const publishLeague = useCallback(async (id) => {
    setGlobalLoading('action', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${id}/publish`);
      return { success: true, message: response.message || 'League published successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to publish league' };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const generateFixtures = useCallback(async (id, data = {}) => {
    setGlobalLoading('action', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${id}/fixtures/generate`, data);
      return { success: true, message: 'Fixtures generated successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const getFixtures = useCallback(async (leagueId, params = {}) => {
    setGlobalLoading('detail', true);
    try {
      const { data } = await apiClient.get(`/leagues/${leagueId}/fixtures`, { params });
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('detail', false);
    }
  }, []);

  const getLeagueDivisions = useCallback(async (leagueId) => {
    setGlobalLoading('detail', true);
    try {
      const { data } = await apiClient.get(`/leagues/${leagueId}/divisions`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('detail', false);
    }
  }, []);

  const getLeaguePlayers = useCallback(async (leagueId) => {
    setGlobalLoading('players', true);
    try {
      const { data } = await apiClient.get(`/leagues/${leagueId}/players`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('players', false);
    }
  }, []);

  const getAllPlayers = useCallback(async (params = {}) => {
    setGlobalLoading('players', true);
    try {
      const endpoint = user?.organizationId
        ? `/organizations/${user.organizationId}/players`
        : '/organization/players';
      const { data } = await apiClient.get(endpoint, { params });
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('players', false);
    }
  }, [user?.organizationId]);

  const addPlayerToLeague = useCallback(async (leagueId, reqData) => {
    setGlobalLoading('players', true);
    try {
      const { data } = await apiClient.post(`/leagues/${leagueId}/players`, reqData);
      return { success: true, message: data.message || 'Player added successfully', data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('players', false);
    }
  }, []);

  const removePlayerFromLeague = useCallback(async (leagueId, leaguePlayerId) => {
    setGlobalLoading('players', true);
    try {
      const { data } = await apiClient.delete(`/leagues/${leagueId}/players/${leaguePlayerId}`);
      return { success: true, message: data.message || 'Player removed successfully' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to remove player' };
    } finally {
      setGlobalLoading('players', false);
    }
  }, []);

  const analyzeLateEnrollment = useCallback(async (leagueId, reqData) => {
    setGlobalLoading('players', true);
    try {
      const { data } = await apiClient.post(`/leagues/${leagueId}/players/analyze`, reqData);
      return { success: true, message: data.message || 'Enrollment analysis generated', data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to analyze enrollment' };
    } finally {
      setGlobalLoading('players', false);
    }
  }, []);

  const deleteLeague = useCallback(async (id) => {
    setGlobalLoading('action', true);
    try {
      await apiClient.delete(`/leagues/${id}`);
      setLeagues((prev) => prev.filter((l) => l.id !== id));
      return { success: true, message: 'League deleted successfully' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const joinLeague = useCallback(async (leagueId, reqData = {}) => {
    try {
      const { data: response } = await apiClient.post(`/leagues/${leagueId}/join`, reqData);
      return {
        success: true,
        message: response.message || 'Successfully joined the league',
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to join league',
        code: error.response?.data?.code,
      };
    }
  }, []);

  const leaveLeague = useCallback(async (leagueId) => {
    try {
      const { data: response } = await apiClient.post(`/leagues/${leagueId}/leave`);
      return {
        success: true,
        message: response.message || 'Successfully left the league',
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to leave league',
      };
    }
  }, []);

  const joinByToken = useCallback(async (leagueId, inviteToken) => {
    try {
      const { data: response } = await apiClient.post('/leagues/join-by-token', { leagueId, inviteToken });
      return {
        success: true,
        message: response.message || 'Successfully joined the league via invite link',
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to join league',
        code: error.response?.data?.code,
      };
    }
  }, []);

  const getAvailableGames = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/match-results/games');
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to fetch games' };
    }
  }, []);

  const getLeaguesByGame = useCallback(async (gameId, showAll = false) => {
    try {
      const query = showAll ? '?showAll=true' : '';
      const { data } = await apiClient.get(`/match-results/leagues/game/${gameId}${query}`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to fetch leagues' };
    }
  }, []);

  const joinByCode = useCallback(async (joinCode) => {
    try {
      const { data: response } = await apiClient.post('/leagues/join-by-code', { joinCode });
      return {
        success: true,
        message: response.message || 'Successfully joined the league via invite code',
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to join league',
        code: error.response?.data?.code,
      };
    }
  }, []);

  const getPublicLeagues = useCallback(async (params = {}) => {
    const { signal, ...rest } = params;
    setGlobalLoading('list', true);
    try {
      const { data } = await apiClient.get('/leagues', { params: rest, signal });
      return { success: true, data: data.data };
    } catch (error) {
      if (error.name === 'CanceledError') return { success: false, cancelled: true };
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('list', false);
    }
  }, []);

  const getLeagueStandings = useCallback(async (id, params = {}) => {
    setGlobalLoading('detail', true);
    try {
      const { data } = await apiClient.get(`/leagues/${id}/standings`, { params });
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('detail', false);
    }
  }, []);

  const overridePlayerStandings = useCallback(async (leagueId, leaguePlayerId, reqData) => {
    setGlobalLoading('action', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${leagueId}/players/${leaguePlayerId}/override`, reqData);
      return { success: true, message: response.message || 'Standings overridden successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to override standings' };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const withdrawPlayer = useCallback(async (leagueId, leaguePlayerId) => {
    setGlobalLoading('action', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${leagueId}/players/${leaguePlayerId}/withdraw`);
      return { success: true, message: response.message || 'Player withdrawn successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to withdraw player' };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  // Wizard methods
  const getWizardClubs = useCallback(async () => {
    setGlobalLoading('wizard', true);
    try {
      const { data } = await apiClient.get('/leagues/wizard/clubs');
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('wizard', false);
    }
  }, []);

  const getWizardGameSeasons = useCallback(async (gameName) => {
    setGlobalLoading('wizard', true);
    try {
      const normalizedGameName =
        typeof gameName === 'string' && gameName.length > 0
          ? gameName.charAt(0).toUpperCase() + gameName.slice(1).toLowerCase()
          : gameName;
      const { data } = await apiClient.get(`/leagues/wizard/games/${normalizedGameName}/seasons`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('wizard', false);
    }
  }, []);

  const getAllVenues = useCallback(async () => {
    setGlobalLoading('action', true);
    try {
      const { data } = await apiClient.get('/organization/venues/all');
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const createWizardLeague = useCallback(async (reqData) => {
    setGlobalLoading('wizard', true);
    try {
      const { data: response } = await apiClient.post('/leagues/wizard', reqData);
      return { success: true, message: response.message || 'Wizard league created successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('wizard', false);
    }
  }, []);

  const updateWizardLeague = useCallback(async (leagueId, reqData) => {
    setGlobalLoading('wizard', true);
    try {
      const { data: response } = await apiClient.patch(`/leagues/wizard/${leagueId}`, reqData);
      return { success: true, message: response.message || 'Wizard league updated successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('wizard', false);
    }
  }, []);

  const activateWizardLeague = useCallback(async (leagueId) => {
    setGlobalLoading('wizard', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/wizard/${leagueId}/activate`);
      return { success: true, message: response.message || 'Wizard league activated successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('wizard', false);
    }
  }, []);

  // Additional league operations
  const getJoinRequests = useCallback(async (leagueId, params = {}) => {
    setGlobalLoading('players', true);
    try {
      const { data } = await apiClient.get(`/leagues/${leagueId}/join-requests`, { params });
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('players', false);
    }
  }, []);

  const approveJoinRequest = useCallback(async (leagueId, leaguePlayerId, reqData) => {
    setGlobalLoading('players', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${leagueId}/join-requests/${leaguePlayerId}/approve`, reqData);
      return { success: true, message: response.message || 'Join request processed successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('players', false);
    }
  }, []);

  const invitePlayerByEmail = useCallback(async (leagueId, reqData) => {
    setGlobalLoading('players', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${leagueId}/invite`, reqData);
      return { success: true, message: response.message || 'Invitation sent successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('players', false);
    }
  }, []);

  const finalizeLeague = useCallback(async (leagueId) => {
    setGlobalLoading('action', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${leagueId}/finalize`);
      return { success: true, message: response.message || 'League finalized successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const overrideStandings = useCallback(async (leagueId, reqData) => {
    setGlobalLoading('action', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${leagueId}/standings/override`, reqData);
      return { success: true, message: response.message || 'Standings overridden successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const recordMatchResult = useCallback(async (leagueId, fixtureId, reqData) => {
    setGlobalLoading('action', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${leagueId}/fixtures/${fixtureId}/result`, reqData);
      return { success: true, message: response.message || 'Match result recorded successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to record match result' };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const recordWalkover = useCallback(async (leagueId, fixtureId, reqData) => {
    setGlobalLoading('action', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${leagueId}/fixtures/${fixtureId}/walkover`, reqData);
      return { success: true, message: response.message || 'Walkover recorded successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to record walkover' };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const advanceToNextRound = useCallback(async (leagueId) => {
    setGlobalLoading('action', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${leagueId}/next-round`);
      return { success: true, message: response.message || 'Advanced to next round successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to advance to next round' };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const advanceToKnockout = useCallback(async (leagueId) => {
    setGlobalLoading('action', true);
    try {
      const { data: response } = await apiClient.post(`/leagues/${leagueId}/advance-to-knockout`);
      return { success: true, message: response.message || 'Advanced to knockout successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to advance to knockout' };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const updateFixture = useCallback(async (leagueId, fixtureId, updateData) => {
    setGlobalLoading('action', true);
    try {
      const { data: response } = await apiClient.put(`/leagues/${leagueId}/fixtures/${fixtureId}`, updateData);
      return { success: true, message: response.message || 'Fixture updated successfully', data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to update fixture' };
    } finally {
      setGlobalLoading('action', false);
    }
  }, []);

  const value = useMemo(() => ({
    leagues,
    currentLeague,
    loading,
    loadingStates,
    getLeagues,
    getLeagueById,
    startLeague,
    createLeague,
    updateLeague,
    publishLeague,
    deleteLeague,
    generateFixtures,
    getAvailableGames,
    getLeaguesByGame,
    getFixtures,
    getLeagueDivisions,
    joinLeague,
    leaveLeague,
    joinByToken,
    joinByCode,
    getPublicLeagues,
    getLeagueStandings,
    overridePlayerStandings,
    withdrawPlayer,
    getLeaguePlayers,
    getAllPlayers,
    addPlayerToLeague,
    removePlayerFromLeague,
    analyzeLateEnrollment,
    // Wizard methods
    getWizardClubs,
    getWizardGameSeasons,
    getAllVenues,
    createWizardLeague,
    updateWizardLeague,
    activateWizardLeague,
    // Additional operations
    getJoinRequests,
    approveJoinRequest,
    invitePlayerByEmail,
    finalizeLeague,
    overrideStandings,
    recordWalkover,
    recordMatchResult,
    advanceToNextRound,
    advanceToKnockout,
    updateFixture,
  }), [
    leagues, currentLeague, loading, loadingStates, getLeagues, getLeagueById, startLeague, createLeague, getAvailableGames, getLeaguesByGame,
    updateLeague, publishLeague, deleteLeague, generateFixtures, getFixtures, getLeagueDivisions, joinLeague, leaveLeague, joinByToken, joinByCode, getPublicLeagues,
    getLeagueStandings, overridePlayerStandings, withdrawPlayer, getLeaguePlayers, getAllPlayers, addPlayerToLeague, removePlayerFromLeague, analyzeLateEnrollment, getWizardClubs,
    getWizardGameSeasons, getAllVenues, createWizardLeague, updateWizardLeague, activateWizardLeague,
    getJoinRequests, approveJoinRequest, invitePlayerByEmail, finalizeLeague,
    overrideStandings, recordWalkover, recordMatchResult, advanceToNextRound, advanceToKnockout,
    updateFixture
  ]);

  return (
    <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>
  );
}
