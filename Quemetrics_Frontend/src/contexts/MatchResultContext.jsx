import React, { createContext, useCallback, useMemo } from 'react';
import matchResultService from '../Services/matchResultService';

export const MatchResultContext = createContext();

export const MatchResultProvider = ({ children }) => {
  /**
   * Fetch all available games (Snooker, Pool, Poker)
   */
  const getGames = useCallback(async () => {
    try {
      const response = await matchResultService.getAvailableGames();
      const games = response?.data ?? response;
      return { success: true, data: games };
    } catch (error) {
      console.error('[MatchResultContext] getGames error:', error);
      return { success: false, error: error.message || 'Failed to fetch games' };
    }
  }, []);

  /**
   * Fetch pending walkovers for a specific league
   */
  const getPendingWalkoversByLeague = useCallback(async (leagueId) => {
    try {
      const data = await matchResultService.getPendingWalkoversForLeague(leagueId);
      return { success: true, data };
    } catch (error) {
      console.error('[MatchResultContext] getPendingWalkoversByLeague error:', error);
      return { success: false, error: error.message || 'Failed to fetch pending walkovers' };
    }
  }, []);

  const getOrganizationGameTypes = useCallback(async () => {
    try {
      const data = await matchResultService.getOrganizationGameTypes();
      return { success: true, data: data?.data ?? data };
    } catch (error) {
      console.error('[MatchResultContext] getOrganizationGameTypes error:', error);
      return { success: false, error: error.message || 'Failed to fetch organization game types' };
    }
  }, []);

  const getDisputesBySport = useCallback(async (sport) => {
    try {
      const data = await matchResultService.getDisputesBySport(sport);
      return { success: true, data: data?.data ?? data };
    } catch (error) {
      console.error('[MatchResultContext] getDisputesBySport error:', error);
      return { success: false, error: error.message || 'Failed to fetch disputes by sport' };
    }
  }, []);

  const getDisputeDetails = useCallback(async (disputeId) => {
    try {
      const data = await matchResultService.getDisputeDetails(disputeId);
      return { success: true, data: data?.data ?? data };
    } catch (error) {
      console.error('[MatchResultContext] getDisputeDetails error:', error);
      return { success: false, error: error.message || 'Failed to fetch dispute details' };
    }
  }, []);

  const resolveDispute = useCallback(async (disputeId, resolutionData) => {
    try {
      const data = await matchResultService.resolveDispute(disputeId, resolutionData);
      return { success: true, data: data?.data ?? data };
    } catch (error) {
      console.error('[MatchResultContext] resolveDispute error:', error);
      return { success: false, error: error.message || 'Failed to resolve dispute' };
    }
  }, []);

  const getResultsAwaitingAdminApproval = useCallback(async () => {
    try {
      const data = await matchResultService.getResultsAwaitingAdminApproval();
      return { success: true, data: data?.data ?? data };
    } catch (error) {
      console.error('[MatchResultContext] getResultsAwaitingAdminApproval error:', error);
      return { success: false, error: error.message || 'Failed to fetch admin approval results' };
    }
  }, []);

  const approveMatchResult = useCallback(async (resultId, adminNotes = '') => {
    try {
      const data = await matchResultService.approveMatchResult(resultId, adminNotes);
      return { success: true, data: data?.data ?? data };
    } catch (error) {
      console.error('[MatchResultContext] approveMatchResult error:', error);
      return { success: false, error: error.message || 'Failed to approve match result' };
    }
  }, []);

  const value = useMemo(() => ({
    getGames,
    getPendingWalkoversByLeague,
    getOrganizationGameTypes,
    getDisputesBySport,
    getDisputeDetails,
    resolveDispute,
    getResultsAwaitingAdminApproval,
    approveMatchResult,
  }), [
    getGames,
    getPendingWalkoversByLeague,
    getOrganizationGameTypes,
    getDisputesBySport,
    getDisputeDetails,
    resolveDispute,
    getResultsAwaitingAdminApproval,
    approveMatchResult,
  ]);

  return (
    <MatchResultContext.Provider value={value}>
      {children}
    </MatchResultContext.Provider>
  );
};

export default MatchResultContext;
