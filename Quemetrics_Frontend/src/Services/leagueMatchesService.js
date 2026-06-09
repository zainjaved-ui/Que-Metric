import apiClient from '../contexts/apiClient';

/**
 * LeagueMatches Service - Handles all API calls for league management
 */

/**
 * Fetch all clubs for the authenticated user's organization (only user's clubs)
 */
export const getClubs = async () => {
  try {
    // Use /my-clubs to get only the user's own clubs
    const response = await apiClient.get('/clubs/my-clubs');
    return response.data?.data || [];
  } catch (error) {
    // Fallback to /clubs if /my-clubs fails
    try {
      console.warn('getClubs: /my-clubs endpoint failed, trying /clubs');
      const response = await apiClient.get('/clubs');
      return response.data?.data || [];
    } catch (fallbackError) {
      console.error('Error fetching clubs:', fallbackError);
      throw error;
    }
  }
};

/**
 * Fetch all games available in the system
 */
export const getGames = async () => {
  try {
    const response = await apiClient.get('/organization/games');
    return response.data?.data || [];
  } catch (error) {
    console.error('Error fetching games:', error);
    throw error;
  }
};

/**
 * Fetch leagues for a specific club and game combination
 * Uses query parameters to filter by club and game
 * Note: This is a placeholder - the backend may need to be extended for direct club filtering
 */
export const getLeaguesForClubAndGame = async () => {
  try {
    // Get all leagues for the organization
    const response = await apiClient.get('/leagues');
    const allLeagues = response.data?.data || [];

    // Filter by club and game - require both to be present
    // Note: Backend may need to be extended to support direct club filtering
    // For now, we'll fetch all and filter on the frontend
    return allLeagues;
  } catch (error) {
    console.error('Error fetching leagues:', error);
    throw error;
  }
};

/**
 * Get all leagues for the organization
 */
export const getLeagues = async (filters = {}) => {
  try {
    const params = new URLSearchParams();

    if (filters.sport) params.append('sport', filters.sport);
    if (filters.status) params.append('status', filters.status);
    if (filters.organizationId) params.append('organizationId', filters.organizationId);

    const response = await apiClient.get(`/leagues?${params.toString()}`);
    return response.data?.data || [];
  } catch (error) {
    console.error('Error fetching leagues:', error);
    throw error;
  }
};

/**
 * Fetch divisions for a specific league
 */
export const getDivisionsForLeague = async (leagueId) => {
  try {
    const response = await apiClient.get(`/leagues/${leagueId}/divisions`);
    return response.data?.data || [];
  } catch (error) {
    console.error(`Error fetching divisions for league ${leagueId}:`, error);
    throw error;
  }
};

/**
 * Fetch fixtures for a specific league (optionally filtered by division)
 */
export const getFixturesForLeague = async (leagueId, divisionId = null, statusFilter = null) => {
  try {
    let url = `/leagues/${leagueId}/fixtures`;
    const params = new URLSearchParams();

    if (divisionId) params.append('divisionId', divisionId);
    if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);

    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;

    const response = await apiClient.get(url);
    return response.data?.data || [];
  } catch (error) {
    console.error(`Error fetching fixtures for league ${leagueId}:`, error);
    throw error;
  }
};

/**
 * Fetch a single fixture by ID for detailed view
 */
export const getFixtureById = async (leagueId, fixtureId) => {
  try {
    const response = await apiClient.get(`/leagues/${leagueId}/fixtures/${fixtureId}`);
    return response.data?.data || null;
  } catch (error) {
    console.error(`Error fetching fixture ${fixtureId}:`, error);
    throw error;
  }
};

/**
 * Get league details with all related data
 */
export const getLeagueDetails = async (leagueId) => {
  try {
    const response = await apiClient.get(`/leagues/${leagueId}`);
    return response.data?.data || null;
  } catch (error) {
    console.error(`Error fetching league details for ${leagueId}:`, error);
    throw error;
  }
};

/**
 * Get match result details (for modal view)
 * This could be a separate endpoint or included in fixture data
 */
export const getMatchResultDetails = async (leagueId, fixtureId) => {
  try {
    // Try to get detailed fixture information
    const response = await apiClient.get(`/leagues/${leagueId}/fixtures/${fixtureId}`);
    return response.data?.data || null;
  } catch (error) {
    console.error(`Error fetching match details for fixture ${fixtureId}:`, error);
    throw error;
  }
};

/**
 * Advance the league to the next round (round-by-round strategy)
 * Returns { success, data } or throws with the backend error message
 */
export const advanceToNextRound = async (leagueId) => {
  try {
    const response = await apiClient.post(`/leagues/${leagueId}/next-round`);
    return response.data;
  } catch (error) {
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      'Failed to advance to next round.';
    throw new Error(msg);
  }
};

/**
 * Seed qualifiers from Group Stage into the pre-generated Knockout Bracket
 */
export const advanceToKnockout = async (leagueId) => {
  try {
    const response = await apiClient.post(`/leagues/${leagueId}/advance-to-knockout`);
    return response.data;
  } catch (error) {
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      'Failed to advance to knockout bracket.';
    throw new Error(msg);
  }
};


/**
 * Finalize a league, triggering promotion and relegation
 */
export const finalizeLeague = async (leagueId) => {
  try {
    const response = await apiClient.post(`/leagues/${leagueId}/finalize`);
    return response.data;
  } catch (error) {
    console.error(`Error finalizing league ${leagueId}:`, error);
    throw error?.response?.data || error;
  }
};

/**
 * Record a new match result
 */
export const recordMatchResult = async (leagueId, fixtureId, resultData) => {
  try {
    const response = await apiClient.post(`/leagues/${leagueId}/fixtures/${fixtureId}/result`, resultData);
    return response.data;
  } catch (error) {
    console.error(`Error recording match result:`, error);
    throw error;
  }
};

/**
 * Record a manual walkover
 */
export const recordWalkover = async (leagueId, fixtureId, walkoverData) => {
  try {
    const response = await apiClient.post(`/leagues/${leagueId}/fixtures/${fixtureId}/walkover`, walkoverData);
    return response.data;
  } catch (error) {
    console.error(`Error recording walkover:`, error);
    throw error;
  }
};

/**
 * Update an existing fixture (date, table, etc.)
 */
export const updateFixtureDetails = async (leagueId, fixtureId, updateData) => {
  try {
    const response = await apiClient.put(`/leagues/${leagueId}/fixtures/${fixtureId}`, updateData);
    return response.data;
  } catch (error) {
    console.error(`Error updating fixture:`, error);
    throw error;
  }
};

/**
 * Helper function to map fixtures to match format expected by component
 */
export const transformFixturesToMatches = (fixtures, divisionId, leagueData = null) => {
  const divisions = Array.isArray(leagueData?.divisions) ? leagueData.divisions : [];

  // Status mapping from backend to frontend
  const statusMap = {
    'scheduled': 'upcoming',
    'in_progress': 'ongoing',
    'completed': 'completed',
    'cancelled': 'cancelled',
    'bye': 'bye'
  };

  // Calculate score from player frames/rack wins
  const calculateScore = (fixture) => {
    // Check for explicit walkover (prefer override to numeric frame values when present)
    const mr = fixture.matchResult || {};
    let resData = fixture.resultData || mr.resultData || {};
    if (typeof resData === 'string') {
      try { resData = JSON.parse(resData); } catch (e) { resData = {}; }
    }
    if (resData?.walkoverScore) {
      return resData.walkoverScore;
    }

    // Check for matchResult scores first (priority as these are the resolved official ones)
    const p1r = mr.player1RackWins ?? fixture.player1RackWins;
    const p2r = mr.player2RackWins ?? fixture.player2RackWins;
    const p1f = mr.player1Frames ?? fixture.player1Frames;
    const p2f = mr.player2Frames ?? fixture.player2Frames;

    // Check game type to determine field priority
    const gameType = getGameType(fixture);
    const isPookerGame = gameType === 'pooker';
    const isPoolGame = gameType === 'pool';
    const isSnookerGame = gameType === 'snooker';

    // For Poker: check rackWins FIRST (this is what gets updated after dispute resolution)
    // For Pool: check rackWins
    // For Snooker: check frames
    if (isPookerGame || isPoolGame) {
      // Prioritize rackWins for pool games
      if (p1r !== null && p1r !== undefined && p2r !== null && p2r !== undefined) {
        const scoreStr = `${p1r}-${p2r}`;
        if (p1r === p2r && fixture.winnerId) return `${scoreStr} (TB)`;
        return scoreStr;
      }
      // Fall back to frames if rackWins not available
      if (p1f !== null && p1f !== undefined && p2f !== null && p2f !== undefined) {
        const scoreStr = `${p1f}-${p2f}`;
        if (p1f === p2f && fixture.winnerId) return `${scoreStr} (TB)`;
        return scoreStr;
      }
    } else if (isSnookerGame) {
      // For Snooker: check frames
      if (p1f !== null && p1f !== undefined && p2f !== null && p2f !== undefined) {
        const scoreStr = `${p1f}-${p2f}`;
        if (p1f === p2f && fixture.winnerId) return `${scoreStr} (TB)`;
        return scoreStr;
      }
    } else {
      // Default fallback
      if (p1f !== null && p1f !== undefined && p2f !== null && p2f !== undefined) {
        const scoreStr = `${p1f}-${p2f}`;
        if (p1f === p2f && fixture.winnerId) return `${scoreStr} (TB)`;
        return scoreStr;
      }

      if (p1r !== null && p1r !== undefined && p2r !== null && p2r !== undefined) {
        const scoreStr = `${p1r}-${p2r}`;
        if (p1r === p2r && fixture.winnerId) return `${scoreStr} (TB)`;
        return scoreStr;
      }
    }

    // NORMALIZE: If numeric scores are null but status is completed and there's a winner, it's a walkover
    if (fixture.status === 'completed' && fixture.winnerId) {
      // Try to get score from resultData
      let resData = fixture.resultData;
      if (typeof resData === 'string') {
        try { resData = JSON.parse(resData); } catch (e) { }
      }

      if (resData?.walkoverScore) return resData.walkoverScore;

      // Default walkover score if we have a winner but no frames recorded
      return fixture.winnerId === fixture.player1Id ? '1-0' : '0-1';
    }

    return '0-0';
  };

  // Infer game type
  const getGameType = (fixture) => {
    const sport = leagueData?.sport?.toLowerCase() || fixture.matchResult?.sport?.toLowerCase() || '';

    if (sport === 'pooker' || sport === 'poker') return 'pooker';
    if (sport === 'pool') return 'pool';
    if (sport === 'snooker') return 'snooker';

    // Fallback to checking frame fields
    if (fixture.player1RackWins !== undefined) return 'pool';
    if (fixture.player1Frames !== undefined) return 'snooker';

    return 'snooker'; // default
  };

  // Extract frame details from resultData
  const getFrameDetails = (fixture) => {
    const gameType = getGameType(fixture);
    let frameData = null;
    const mr = fixture.matchResult || {};

    if (fixture.resultData || fixture.matchResult) {
      const source = fixture.resultData || mr;
      if (gameType === 'snooker' && (source.snookerFrameDetails || mr.snookerFrameDetails)) {
        frameData = source.snookerFrameDetails || mr.snookerFrameDetails;
      } else if (gameType === 'pooker' && (source.pookerFrameDetails || mr.pookerFrameDetails)) {
        frameData = source.pookerFrameDetails || mr.pookerFrameDetails;
      } else if (gameType === 'pool' && (source.poolRackDetails || mr.poolRackDetails)) {
        frameData = source.poolRackDetails || mr.poolRackDetails;
      } else {
        frameData = fixture.resultData || mr.pookerFrameDetails || mr.snookerFrameDetails || mr.poolRackDetails || null;
      }
    } else {
      frameData = fixture.frameDetails || null;
    }

    // Parse JSON strings if needed
    if (typeof frameData === 'string') {
      try {
        frameData = JSON.parse(frameData);
      } catch (e) {
        console.error('Error parsing frame data:', e);
        frameData = null;
      }
    }

    return frameData;
  };

  return (fixtures || []).map(fixture => {
    const backendStatus = fixture.status || 'scheduled';
    const frontendStatus = statusMap[backendStatus] || 'upcoming';

    const booking = (fixture.bookings && fixture.bookings.length > 0) ? fixture.bookings[0] : null;
    const score = calculateScore(fixture);
    const [p1Score, p2Score] = score.split(/[- :]/).map(s => parseInt(s) || 0);

    // Determine Detailed Status
    const detailedStatus = (() => {
      if (backendStatus === 'bye') return 'BYE';

      // NEW: Check if match is booked and ready to play
      if (backendStatus === 'scheduled' && booking?.status === 'confirmed') {
        return 'READY TO PLAY';
      }

      if (backendStatus !== 'completed') return backendStatus.toUpperCase();

      // Check for resolved dispute - if matchResult has resultStatus "Confirmed" it was resolved
      const mr = fixture.matchResult || {};
      if (mr.resultStatus === 'Confirmed' && mr.confirmedAt) {
        // Check if there was a dispute that was resolved
        const wasDisputed = mr.notes?.includes('Dispute resolved') || mr.resultStatus === 'Confirmed';
        if (wasDisputed) {
          // This is a resolved dispute - show as COMPLETE (not DISPUTE)
          console.log('[DetailedStatus] Resolved dispute detected:', { winnerId: fixture.winnerId, p1Score, p2Score });
        }
      }

      // Check for walkover/forfeit
      let resData = fixture.resultData;
      if (typeof resData === 'string') {
        try { resData = JSON.parse(resData); } catch (e) { }
      }

      if (fixture.isWalkover || mr.isWalkover || resData?.isWalkover || resData?.walkoverScore) {
        return 'FORFEIT';
      }

      // Check for draw (equal scores, no winner decided)
      if (p1Score === p2Score && !fixture.winnerId) {
        return 'DRAW';
      }

      // Check for tie-break (equal scores but a winner was decided e.g. via tie-break frame)
      if (p1Score === p2Score && fixture.winnerId) {
        return 'TIE-BREAK';
      }

      // Check for whitewash (Winner won all, Loser won 0)
      const hasWhitewashRecord = mr.player1WhitewashWins > 0 || mr.player2WhitewashWins > 0;
      const isCleanSweep = (p1Score > 0 && p2Score === 0) || (p2Score > 0 && p1Score === 0);

      // We only call it WHITEWASH if it was at least a best-of-3 or more,
      // or if explicitly recorded as such.
      if (hasWhitewashRecord || (isCleanSweep && (p1Score >= 2 || p2Score >= 2))) {
        return 'WHITEWASH';
      }

      return 'COMPLETE';
    })();

    return {
      id: fixture.id,
      divisionId: divisionId || fixture.divisionId,
      homeTeam: fixture.player1?.name || fixture.homeTeamName || 'TBD',
      awayTeam: fixture.player2?.name || fixture.awayTeamName || 'TBD',
      date: booking?.bookingDate || 'TBA',
      startTime: booking?.startTime || 'TBA',
      tableName: (() => {
        // Get venue name with multiple fallbacks
        const vName = booking?.venue?.venueName ||
          booking?.venue?.name ||
          booking?.venueName ||
          fixture.venue;

        // Get table name - prefer formatted version over raw number
        const tName = booking?.tableName ||
          (booking?.tableNumber ? `Table ${booking.tableNumber}` : '') ||
          (fixture.tableNumber ? `Table ${fixture.tableNumber}` : '');

        // Construct display string
        if (vName && tName) {
          return `${vName} - ${tName}`;
        }
        return vName || tName || 'TBA';
      })(),
      tableNumber: booking?.tableNumber || fixture.tableNumber || '1',
      venueId: booking?.venueId,
      venueName: booking?.venue?.venueName || booking?.venue?.name || booking?.venueName || 'TBA',
      score,
      gameType: getGameType(fixture),
      frameDetails: getFrameDetails(fixture),
      status: frontendStatus,
      detailedStatus,
      fixtureId: fixture.id,
      stage: fixture.stage, // group, knockout, swiss, etc.
      imageUrl: fixture.matchResult?.imageUrl || null,
      winnerId: fixture.winnerId,
      loserId: fixture.loserId,
      // Expose matchResult at top level for easy access in components
      matchResult: fixture.matchResult || null,
      additionalData: {
        ...fixture,
        division: divisions.find(d => d.id === (divisionId || fixture.divisionId)) || null
      }
    };
  });
};

/**
 * Map league data for the component
 */
export const transformLeagueData = (league) => {
  if (!league) return null;

  return {
    id: league.id,
    name: league.name,
    season: league.season?.name,
    organizationId: league.organizationId,
    sport: league.sport,
    visibility: league.visibility || 'public',
    joinAllowed: league.joinAllowed !== undefined ? league.joinAllowed : true,
    lateJoinAllowed: league.lateJoinAllowed || false,
    joinCode: league.joinCode,
    generalInviteToken: league.generalInviteToken,
    status: league.status,
    divisions: league.divisions || [],
    players: league.leaguePlayers || [],
    startDate: league.leagueStartDate || league.season?.startDate,
    endDate: league.leagueEndDate || league.season?.endDate,
  };
};
