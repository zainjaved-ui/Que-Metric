const { Op } = require("sequelize");
const sequelize = require("../config/db");
const {
  MatchResult,
  Booking,
  Fixture,
  League,
  Tournament,
  TournamentMatch,
  TournamentParticipant,
  TournamentFormat,
  TournamentRound,
  TournamentScoringRules,
  Player,
  Game,
  Season,
  Division,
  LeaguePlayer,
  PokerTournamentStructure,
  User,
  Notification,
  DisputedMatch,
  Organization,
  VenueOwner,
} = require("../models");
const standingsService = require("../services/standingsService");
const { normalizeVenueToken, parseVenueCollections, resolveVenueOwnerMerged } = require("../utils/venueOwnerEmbedded");
const {
  sendMatchResultSubmissionEmail,
  sendMatchResultStatusUpdateEmail,
  sendWalkoverSubmittedEmail,
  sendWalkoverRejectedEmail
} = require("../utils/email");
const tournamentController = require("./tournamentController");

/**
 * Helper to find a player profile by resolving all user IDs associated with the current user's email.
 */
const resolvePlayerProfile = async (userId, include = [], transaction = null) => {
  const currentUser = await User.findByPk(userId, { transaction });
  if (!currentUser) return null;

  const allUsersWithEmail = await User.findAll({
    where: { email: currentUser.email },
    attributes: ['id'],
    transaction
  });
  const userIds = allUsersWithEmail.map(u => u.id);

  return await Player.findOne({
    where: { userId: { [Op.in]: userIds } },
    include,
    transaction,
    order: [['createdAt', 'ASC']]
  });
};

/**
 * Gets all player profile IDs associated with a user's email.
 */
const getAllPlayerIdsForUser = async (userId, transaction = null) => {
  const currentUser = await User.findByPk(userId, { transaction });
  if (!currentUser) return [];

  const allUsersWithEmail = await User.findAll({
    where: { email: currentUser.email },
    attributes: ['id'],
    transaction
  });
  const userIds = allUsersWithEmail.map(u => u.id);

  const players = await Player.findAll({
    where: { userId: { [Op.in]: userIds } },
    attributes: ['id'],
    transaction
  });

  return players.map(p => p.id);
};

/**
 * Parse reporting config safely from League or Booking League
 */
const parseReportingConfig = (leagueReporting, fallbackReporting) => {
  const raw = leagueReporting || fallbackReporting || {};
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[parseReportingConfig] failed to parse JSON reporting config:', e.message);
      return {};
    }
  }
  return raw;
};

/**
 * After a booking-linked tournament MatchResult is confirmed (player or admin), update the
 * bracket row and run the same progression/statistics hooks as the native tournament confirm flow.
 */
async function syncTournamentMatchCompletion({
  tournamentId,
  player1Id,
  player2Id,
  matchResult,
  transaction,
}) {
  if (!tournamentId || !player1Id || !player2Id || !matchResult) return;

  let tm = null;
  const bookingTmId = matchResult.booking?.tournamentMatchId;
  if (bookingTmId) {
    tm = await TournamentMatch.findByPk(bookingTmId, { transaction });
  }
  if (!tm) {
    tm = await TournamentMatch.findOne({
      where: {
        tournamentId,
        player1Id,
        player2Id,
      },
      transaction,
    });
  }

  if (!tm || tm.player2Id == null) {
    console.warn("[syncTournamentMatchCompletion] No playable TournamentMatch found", {
      tournamentId,
      bookingTmId,
      player1Id,
      player2Id,
    });
    return;
  }

  if (tm.status === "completed") {
    console.info("[syncTournamentMatchCompletion] TournamentMatch already completed; skipping", { id: tm.id });
    return;
  }

  const sport = String(matchResult.sport || '').toLowerCase();
  let p1Score = matchResult.player1Frames ?? 0;
  let p2Score = matchResult.player2Frames ?? 0;
  if (sport === "pool") {
    p1Score = matchResult.player1RackWins ?? p1Score;
    p2Score = matchResult.player2RackWins ?? p2Score;
  }

  let winnerSide = null;
  if (matchResult.winnerId) {
    if (String(matchResult.winnerId) === String(tm.player1Id)) winnerSide = "player1";
    else if (String(matchResult.winnerId) === String(tm.player2Id)) winnerSide = "player2";
  }
  if (!winnerSide) {
    if (p1Score > p2Score) winnerSide = "player1";
    else if (p2Score > p1Score) winnerSide = "player2";
    else if (p1Score === p2Score) {
      // Match ended in a draw - set winner to "draw" for proper standings calculation
      winnerSide = "draw";
    }
  }

  const now = new Date();
  const updatePayload = {
    status: "completed",
    player1Confirmed: true,
    player2Confirmed: true,
    player1ConfirmedDate: tm.player1ConfirmedDate || now,
    player2ConfirmedDate: tm.player2ConfirmedDate || now,
  };
  if (winnerSide) {
    updatePayload.winner = winnerSide;
  }

  if (sport === "snooker" || sport === "pooker" || sport === "pool") {
    updatePayload.player1FramesWon = p1Score;
    updatePayload.player2FramesWon = p2Score;
  }

  const frameDetails =
    matchResult.snookerFrameDetails ||
    matchResult.pookerFrameDetails ||
    matchResult.poolRackDetails;
  if (frameDetails) {
    updatePayload.player1FrameDetails = frameDetails;
    updatePayload.player2FrameDetails = frameDetails;
  }

  // Preserve isWalkover flag when syncing match result to tournament match
  if (matchResult.isWalkover) {
    updatePayload.isWalkover = true;
  }

  await tm.update(updatePayload, { transaction });

  const tournament = await Tournament.findByPk(tournamentId, { transaction });
  if (!tournament) return;

  // Increment tournament completedMatches counter (only count playable matches, not byes where player2Id is null)
  if (tm.player2Id != null) {
    const currentCompleted = Number(tournament.completedMatches) || 0;
    await tournament.update({ completedMatches: currentCompleted + 1 }, { transaction });
  }

  const refreshed = await TournamentMatch.findByPk(tm.id, { transaction });
  await tournamentController._updatePlayerStatisticsAfterMatch(refreshed, tournament, transaction);
  await tournamentController._updateTournamentParticipantStats(refreshed, tournamentId, sport || "snooker", transaction);
  await tournamentController._checkAndProgressRound(tournamentId, refreshed.roundNumber, transaction);
}

// ============================================
// GET AVAILABLE GAMES
// ============================================
exports.getAvailableGames = async (req, res) => {
  try {
    const games = await Game.findAll({
      where: {
        isActive: true,
        name: { [Op.notIn]: ['Poker', 'poker'] }
      },
      attributes: ["id", "name", "description"],
      order: [["name", "ASC"]],
    });

    console.log("[getAvailableGames] Games found:", games.length, games.map(g => ({ id: g.id, name: g.name, rawName: JSON.stringify(g.name) })));

    res.json({
      success: true,
      data: games,
      message: "Available games retrieved successfully",
    });
  } catch (error) {
    console.error("getAvailableGames error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// ============================================
// GET LEAGUES BY GAME
// ============================================
exports.getLeaguesByGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId } = req.user;
    const { showAll } = req.query; // Optional param to show all leagues (for Discover tab)

    console.log("[getLeaguesByGame] Request:", { gameId, userId, showAll });

    // Get game to determine sport (Case-Insensitive lookup if not UUID)
    const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

    const game = isUUID(gameId)
      ? await Game.findByPk(gameId)
      : await Game.findOne({
          where: sequelize.where(
            sequelize.fn('LOWER', sequelize.col('name')),
            String(gameId).toLowerCase().trim()
          ),
        });

    if (!game) {
      console.error("[getLeaguesByGame] Game not found:", gameId);
      return res.status(404).json({ success: false, error: "Game not found" });
    }

    console.log("[getLeaguesByGame] Game found:", { id: game.id, name: game.name });

    // Map game name to sport enum (case-insensitive, trim whitespace)
    const gameName = game.name.toLowerCase().trim();
    let sport;

    if (gameName === "snooker") {
      sport = ["Snooker", "snooker"];
    } else if (gameName === "pool") {
      sport = ["Pool", "pool"];
    } else if (gameName === "pooker" || gameName === "poker") {
      sport = ["Pooker", "poker", "Poker", "pooker"];
    }

    console.log("[getLeaguesByGame] Sport mapping:", { gameId, gameName, sport });

    if (!sport) {
      console.error("[getLeaguesByGame] Invalid game type:", { gameName, availableSports: ["Snooker", "Pool", "Pooker", "Poker"] });
      return res.status(400).json({ success: false, error: "Invalid game type" });
    }

    const isShowAll = showAll === 'true' || showAll === true;

    // For discover/showAll, skip user-specific queries - just show all public leagues
    if (isShowAll) {
      console.log("[getLeaguesByGame] Showing all public leagues for discovery (active + registration_open)");
      const allLeagues = await League.findAll({
        where: {
          sport: { [Op.in]: sport },
          visibility: 'public',
          status: { [Op.in]: ['active', 'registration_open'] }
        },
        include: [
          {
            model: Season,
            as: "season",
            attributes: ["id", "name", "startDate", "endDate"],
          },
          {
            model: VenueOwner,
            as: "venueOwner",
            attributes: ["id", "name", "venueName", "address", "venues"],
            required: false,
          },
        ],
        order: [["name", "ASC"]],
      });

      // Get player counts separately for efficiency
      const leagueIds = allLeagues.map(l => l.id);
      if (leagueIds.length > 0) {
        const allLeaguePlayerData = await LeaguePlayer.findAll({
          where: { leagueId: { [Op.in]: leagueIds } },
          attributes: ['leagueId'],
          raw: true,
        });

        // Build count map
        const countMap = {};
        allLeaguePlayerData.forEach(record => {
          countMap[record.leagueId] = (countMap[record.leagueId] || 0) + 1;
        });

        const leagues = await Promise.all(allLeagues.map(async (league) => ({
          id: league.id,
          name: league.name,
          sport: league.sport,
          status: league.status,
          format: league.format,
          seasonName: league.season?.name,
          leagueStartDate: league.leagueStartDate,
          leagueEndDate: league.leagueEndDate,
          description: league.description,
          visibility: league.visibility || 'public',
          leagueType: league.leagueType || 'fixed',
          joinAllowed: league.joinAllowed !== false,
          lateJoinAllowed: league.lateJoinAllowed || false,
          maxPlayers: league.maxPlayers,
          minPlayers: league.minPlayers,
          playersCount: countMap[league.id] || 0,
          venue: await (async () => {
            if (!league.venueOwner) return null;

            // Use the comprehensive resolver with league's specific venueIds
            const resolvedInfo = await resolveVenueOwnerMerged(league.venueOwner, {
              organizationId: league.organizationId || league.venueOwner.organizationId,
              venueIds: league.venueIds // Prioritize league's selected venues
            });

            return {
              name: resolvedInfo.displayName || league.venueOwner.venueName || league.venueOwner.name,
              address: league.venueOwner.address
            };
          })(),
        })));

        return res.json({
          success: true,
          data: leagues,
          count: leagues.length,
          message: leagues.length > 0
            ? "Leagues retrieved successfully"
            : `No public leagues available for ${game.name}.`,
        });
      } else {
        return res.json({
          success: true,
          data: [],
          count: 0,
          message: `No public leagues available for ${game.name}.`,
        });
      }
    }

    // For member view, get user's league access
    let organization = null;
    try {
      organization = await Organization.findOne({ where: { userId } });
    } catch (e) {
      console.log("[getLeaguesByGame] Not an organization account");
    }

    // Build where clause based on user role - combine ALL possible sources
    const whereClause = { sport: { [Op.in]: sport } };
    const allLeagueIds = [];

    // Get player profile first
    const player = await resolvePlayerProfile(userId);
    if (player) {
      console.log("[getLeaguesByGame] User has player profile:", player.id);
    }

    // Get all player IDs first so we can use them in the parallel queries
    const playerIds = await getAllPlayerIdsForUser(userId);

    // Parallel queries instead of sequential
    const [orgLeagues, venueOwner, playerLeagueRecs] = await Promise.all([
      organization
        ? League.findAll({
            where: { organizationId: organization.id, sport },
            attributes: ['id'],
            raw: true,
          }).then(leagues => {
            console.log("[getLeaguesByGame] User is organization admin:", organization.id);
            return leagues;
          })
        : Promise.resolve([]),
      VenueOwner.findOne({ where: { userId } }),
      playerIds.length > 0 ? LeaguePlayer.findAll({
        where: { playerId: { [Op.in]: playerIds } },
        attributes: ['leagueId'],
        raw: true,
      }) : Promise.resolve([]),
    ]);

    allLeagueIds.push(...orgLeagues.map(l => l.id));

    if (venueOwner) {
      console.log("[getLeaguesByGame] User is venue owner:", venueOwner.id);
      const venueLeagues = await League.findAll({
        where: { venueOwnerId: venueOwner.id, sport },
        attributes: ['id'],
        raw: true,
      });
      allLeagueIds.push(...venueLeagues.map(l => l.id));
    }

    allLeagueIds.push(...playerLeagueRecs.map(lp => lp.leagueId));

    // Check if user has active bookings in leagues
    let bookingLeagueIds = [];
    if (playerIds.length > 0) {
      const userBookings = await Booking.findAll({
        where: {
          [Op.or]: [
            { playerId: { [Op.in]: playerIds }, status: 'confirmed' },
            { opponentId: { [Op.in]: playerIds }, status: 'confirmed' }
          ],
          leagueId: { [Op.ne]: null }
        },
        attributes: ['leagueId'],
        raw: true,
      });
      if (userBookings.length > 0) {
        console.log("[getLeaguesByGame] User has confirmed bookings:", userBookings.length);
        bookingLeagueIds = userBookings.map(b => b.leagueId);
      }
    }
    allLeagueIds.push(...bookingLeagueIds);

    // Remove duplicates
    const uniqueLeagueIds = [...new Set(allLeagueIds)];
    console.log("[getLeaguesByGame] Combined league IDs from all sources:", uniqueLeagueIds.length);

    if (uniqueLeagueIds.length === 0) {
      console.log("[getLeaguesByGame] User has no access to any leagues");
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: "You are not registered in any leagues. Book a league or create a profile to get started.",
      });
    }

    whereClause.id = { [Op.in]: uniqueLeagueIds };

    // Get member leagues without loading all player records
    const allLeagues = await League.findAll({
      where: whereClause,
      include: [
        {
          model: Season,
          as: "season",
          attributes: ["id", "name", "startDate", "endDate"],
        },
        {
          model: VenueOwner,
          as: "venueOwner",
          attributes: ["id", "name", "venueName", "address", "venues"],
          required: false,
        },
      ],
      order: [["name", "ASC"]],
    });

    // Get player count and approval status for each league efficiently
    const leagueIds = allLeagues.map(l => l.id);
    const leaguePlayerData = await LeaguePlayer.findAll({
      where: { leagueId: { [Op.in]: leagueIds } },
      attributes: ['leagueId', 'playerId', 'approvalStatus'],
      raw: true,
    });

    // Build maps for quick lookup
    const playerCountMap = {};
    const playerStatusMap = {}; // For current user's approval status
    const currentPlayerId = player ? player.id : null;

    leaguePlayerData.forEach(record => {
      // Count all players per league
      playerCountMap[record.leagueId] = (playerCountMap[record.leagueId] || 0) + 1;

      // Track if ANY of the current user's profiles are in the league and their status
      if (playerIds.includes(record.playerId)) {
        playerStatusMap[record.leagueId] = record.approvalStatus;
      }
    });

    console.log("[getLeaguesByGame] Query executed:", {
      sport,
      totalLeaguesFound: allLeagues.length,
    });

    // If no leagues found, provide detailed debugging
    if (allLeagues.length === 0) {
      console.warn("[getLeaguesByGame] No leagues found for sport:", { sport });

      // Check ALL leagues in database
      const totalLeagues = await League.count();
      console.warn("[getLeaguesByGame] Total leagues in database:", totalLeagues);

      if (totalLeagues === 0) {
        console.error("[getLeaguesByGame] DATABASE IS EMPTY - No leagues exist at all!");
        console.error("[getLeaguesByGame] You need to create leagues first. Use POST /api/leagues endpoint or import data.");
      }
    }

    const leagues = await Promise.all(allLeagues.map(async (league) => {
      let resolvedVenue = null;
      if (league.venueOwner) {
        // Use the comprehensive resolver that handles both embedded venues AND club-linked virtual venues
        const resolvedInfo = await resolveVenueOwnerMerged(league.venueOwner, {
          organizationId: league.organizationId || league.venueOwner.organizationId,
          venueIds: league.venueIds
        });

        resolvedVenue = {
          name: resolvedInfo.displayName || league.venueOwner.venueName || league.venueOwner.name,
          address: league.venueOwner.address
        };
      }

      return {
        id: league.id,
        name: league.name,
        sport: league.sport,
        status: league.status,
        format: league.format,
        seasonName: league.season?.name,
        leagueStartDate: league.leagueStartDate,
        leagueEndDate: league.leagueEndDate,
        description: league.description,
        visibility: league.visibility || 'public',
        leagueType: league.leagueType || 'fixed',
        joinAllowed: league.joinAllowed !== false,
        lateJoinAllowed: league.lateJoinAllowed || false,
        maxPlayers: league.maxPlayers,
        minPlayers: league.minPlayers,
        playersCount: playerCountMap[league.id] || 0,
        venue: resolvedVenue,
        // Include statuses for all matching profiles if needed, or just the first found
        leaguePlayers: playerIds.length > 0 && playerStatusMap[league.id] ? [{
          playerId: playerIds[0], // For backward compat, just return one
          approvalStatus: playerStatusMap[league.id]
        }] : [],
      };
    }));

    res.json({
      success: true,
      data: leagues,
      count: leagues.length,
      message: leagues.length > 0
        ? "Leagues retrieved successfully"
        : `No leagues found for ${game.name}. Please create leagues using the organization dashboard or contact your administrator.`,
    });
  } catch (error) {
    console.error("getLeaguesByGame error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// GET TOURNAMENTS BY GAME
// ============================================
exports.getTournamentsByGame = async (req, res) => {
  try {
    const { gameId } = req.params;

    console.log("[getTournamentsByGame] Request:", { gameId });

    // Get game to determine sport
    const game = await Game.findByPk(gameId);
    if (!game) {
      console.error("[getTournamentsByGame] Game not found:", gameId);
      return res.status(404).json({ success: false, error: "Game not found" });
    }

    console.log("[getTournamentsByGame] Game found:", { id: game.id, name: game.name, rawName: JSON.stringify(game.name) });

    // Map game name to sport enum (case-insensitive, trim whitespace)
    // Note: Tournament model uses "pooker" while League model uses "poker"
    const gameName = game.name.toLowerCase().trim();
    let sport;

    if (gameName === "snooker") {
      sport = ["Snooker", "snooker"];
    } else if (gameName === "pool") {
      sport = ["Pool", "pool"];
    } else if (gameName === "pooker" || gameName === "poker") {
      sport = ["Pooker", "poker", "Poker", "pooker"];
    }

    console.log("[getTournamentsByGame] Sport mapping:", { gameId, gameName, sport });

    if (!sport) {
      console.error("[getTournamentsByGame] Invalid game type:", { gameName, availableSports: ["Snooker", "Pool", "Pooker", "Poker"] });
      return res.status(400).json({ success: false, error: "Invalid game type" });
    }

    // Find all active tournaments for this sport
    const tournaments = await Tournament.findAll({
      where: {
        sport: { [Op.in]: sport },
        status: {
          [Op.in]: ["registration", "in_progress"],
        },
      },
      attributes: [
        "id",
        "name",
        "sport",
        "tier",
        "formatId",
        "startDate",
        "endDate",
        "venueId",
        "venueIds",
        "entryFee",
        "maxParticipants",
        "status",
        "description",
      ],
      include: [
        {
          model: Organization,
          as: "organization",
          attributes: ["id", "organizationName"],
          required: false,
        },
      ],
      order: [["startDate", "ASC"]],
    });

    const formattedTournaments = tournaments.map(t => {
      const tourney = t.toJSON();
      if (tourney.organization) {
        tourney.organization.name = tourney.organization.organizationName;
      }
      // venueIds is an array; expose as venue for backward compat if frontend expects it
      if (!tourney.venue && tourney.venueIds && tourney.venueIds.length > 0) {
        tourney.venue = { name: tourney.venueIds[0] };
      }
      return tourney;
    });

    res.json({
      success: true,
      data: formattedTournaments,
      message: "Tournaments retrieved successfully",
    });
  } catch (error) {
    console.error("[getTournamentsByGame] Error retrieving tournaments:", {
      error: error.message,
      stack: error.stack,
      gameId: req.params.gameId,
    });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// GET CONFIRMED UNSCORED BOOKINGS FOR LEAGUE
// ============================================
exports.getLeagueBookings = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { userId } = req.user;

    // Find player profile IDs (Unify by email for dual-role users)
    const playerIds = await getAllPlayerIdsForUser(userId);
    const isOrganization = req.user.role === 'organization';

    // Verify league exists
    const league = await League.findByPk(leagueId);
    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    // Prepare where clause
    const whereClause = {
      leagueId,
      status: "confirmed",
    };

    // For regular players, filter to only show their own bookings
    // For organizations, show all bookings in the league
    if (!isOrganization) {
      if (!playerIds || playerIds.length === 0) {
        return res.status(404).json({ success: false, error: "Player profile not found" });
      }
      whereClause[Op.or] = [{ playerId: { [Op.in]: playerIds } }, { opponentId: { [Op.in]: playerIds } }];
    }

    // Get confirmed bookings without results for this league
    const bookings = await Booking.findAll({
      where: whereClause,
      include: [
        {
          model: MatchResult,
          as: "matchResult",
          required: false,
        },
        {
          model: Player,
          as: "player",
          attributes: ["id", "name", "nickname"],
          include: [
            {
              model: User,
              as: "user",
              attributes: ["email"],
              required: false,
            },
          ],
          required: false,
        },
        {
          model: Player,
          as: "opponent",
          attributes: ["id", "name", "nickname"],
          include: [
            {
              model: User,
              as: "user",
              attributes: ["email"],
              required: false,
            },
          ],
          required: false,
        },
        {
          model: Fixture,
          as: "fixture",
          attributes: ["id", "round", "matchNumber", "divisionId"],
          include: [
            {
              model: Division,
              as: "division",
              attributes: ["id", "name"],
              required: false,
            },
          ],
          required: false,
        },
      ],
      order: [["bookingDate", "ASC"], ["startTime", "ASC"]],
    });

    // Keep booking visible for the other player while match is pending confirmation.
    const actionableBookings = bookings.filter((booking) => {
      const match = booking.tournamentMatch;
      const currentPlayerId = playerIds.find(
        (id) => id === booking.playerId || id === booking.opponentId
      );

      // Missing match link => keep previous behavior (no result attached yet)
      if (!match) return !booking.matchResult;

      // If already completed/disputed/voided, do not show in upload list
      if (["completed", "disputed", "voided", "cancelled"].includes(match.status)) return false;

      // Scheduled/in_progress without result: allow submission
      if (!booking.matchResult) return true;

      // Pending confirmation: only show to player who has not yet confirmed
      if (match.status === "pending_confirmation" && currentPlayerId) {
        const isP1 = currentPlayerId === match.player1Id;
        const isP2 = currentPlayerId === match.player2Id;
        if (isP1) return !match.player1Confirmed;
        if (isP2) return !match.player2Confirmed;
      }

      return false;
    });

    const formattedBookings = actionableBookings.map((booking) => ({
      id: booking.id,
      fixtureId: booking.fixtureId,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      tableNumber: booking.tableNumber,
      tableName: booking.tableName,
      sport: booking.sport,
      player: {
        id: booking.player?.id,
        name: booking.player?.name,
        nickname: booking.player?.nickname,
        email: booking.player?.user?.email,
      },
      opponent: {
        id: booking.opponent?.id,
        name: booking.opponent?.name,
        nickname: booking.opponent?.nickname,
        email: booking.opponent?.user?.email,
        handicap: booking.opponent?.handicap
      },
      fixture: booking.fixture
        ? {
          id: booking.fixture.id,
          round: booking.fixture.round,
          matchNumber: booking.fixture.matchNumber,
          division: booking.fixture.division?.name,
        }
        : null,
    }));

    res.json({
      success: true,
      data: formattedBookings,
      message: "League bookings retrieved successfully",
    });
  } catch (error) {
    console.error("[getLeagueBookings] Error:", {
      message: error.message,
      stack: error.stack,
      leagueId: req.params.leagueId,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ============================================
// GET UNSCORED TOURNAMENT MATCHES FOR PLAYER
// ============================================
exports.getTournamentBookings = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { userId } = req.user;

    // Find player profile IDs
    const playerIds = await getAllPlayerIdsForUser(userId);
    if (!playerIds || playerIds.length === 0) {
      return res.status(404).json({ success: false, error: "Player profile not found" });
    }

    // Verify tournament exists and is in_progress
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const tournamentFormat = await TournamentFormat.findOne({
      where: { tournamentId },
      attributes: ["bestOfFrames", "roundFormats", "type"],
    });
    const scoringRulesRow = await TournamentScoringRules.findOne({
      where: { tournamentId },
      attributes: ["pointsWin", "pointsDraw", "pointsLoss", "pointsWalkover", "pointsDefaultWin"],
    });
    const defaultBestOf =
      tournamentFormat?.bestOfFrames != null && Number(tournamentFormat.bestOfFrames) > 0
        ? Number(tournamentFormat.bestOfFrames)
        : null;

    const bookings = await Booking.findAll({
      where: {
        tournamentId,
        bookingType: "tournament",
        status: "confirmed",
        tournamentMatchId: { [Op.ne]: null },
        [Op.or]: [{ playerId: { [Op.in]: playerIds } }, { opponentId: { [Op.in]: playerIds } }],
      },
      include: [
        {
          model: MatchResult,
          as: "matchResult",
          required: false,
        },
        {
          model: TournamentMatch,
          as: "tournamentMatch",
          attributes: [
            "id",
            "roundNumber",
            "matchNumber",
            "status",
            "player1Id",
            "player2Id",
            "player1Confirmed",
            "player2Confirmed",
            "bestOfFrames",
            "roundType",
          ],
          required: false,
        },
        {
          model: Player,
          as: "player",
          attributes: ["id", "name", "nickname"],
        },
        {
          model: Player,
          as: "opponent",
          attributes: ["id", "name", "nickname"],
        },
      ],
      order: [["bookingDate", "ASC"], ["startTime", "ASC"]],
    });

    // Keep booking visible for the other player while match is pending confirmation.
    const actionableBookings = bookings.filter((booking) => {
      const match = booking.tournamentMatch;
      const currentPlayerId = playerIds.find(
        (id) => id === match?.player1Id || id === match?.player2Id || id === booking.playerId || id === booking.opponentId
      );

      if (!match) return !booking.matchResult;
      if (["completed", "disputed", "voided", "cancelled"].includes(match.status)) return false;
      if (!booking.matchResult) return true;

      if (match.status === "pending_confirmation" && currentPlayerId) {
        if (currentPlayerId === match.player1Id) return !match.player1Confirmed;
        if (currentPlayerId === match.player2Id) return !match.player2Confirmed;
      }

      return false;
    });

    const formattedBookings = actionableBookings.map((booking) => {
      const currentPlayerId = playerIds.find(
        (id) => id === booking.tournamentMatch?.player1Id || id === booking.tournamentMatch?.player2Id || id === booking.player?.id || id === booking.opponent?.id
      ) || null;
      const playersById = {
        [booking.player?.id]: booking.player,
        [booking.opponent?.id]: booking.opponent,
      };
      const bracketPlayer1 = booking.tournamentMatch?.player1Id ? playersById[booking.tournamentMatch.player1Id] : null;
      const bracketPlayer2 = booking.tournamentMatch?.player2Id ? playersById[booking.tournamentMatch.player2Id] : null;

      return {
        id: booking.id,
        tournamentMatchId: booking.tournamentMatchId,
        fixtureId: booking.fixtureId,
        bookingDate: booking.bookingDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
        tableNumber: booking.tableNumber,
        tableName: booking.tableName,
        sport: booking.sport,
        roundNumber: booking.tournamentMatch?.roundNumber ?? null,
        matchNumber: booking.tournamentMatch?.matchNumber ?? null,
        player: {
          id: booking.player.id,
          name: booking.player.name,
          nickname: booking.player.nickname,
        },
        opponent: {
          id: booking.opponent.id,
          name: booking.opponent.name,
          nickname: booking.opponent.nickname,
        },
        // Explicit perspective data for tournament upload consistency
        currentPlayerId,
        bracketPlayer1: bracketPlayer1
          ? { id: bracketPlayer1.id, name: bracketPlayer1.name, nickname: bracketPlayer1.nickname }
          : null,
        bracketPlayer2: bracketPlayer2
          ? { id: bracketPlayer2.id, name: bracketPlayer2.name, nickname: bracketPlayer2.nickname }
          : null,
        bestOfFrames: (() => {
          const perMatch = booking.tournamentMatch?.bestOfFrames;
          if (perMatch != null && Number(perMatch) > 0) return Number(perMatch);
          if (defaultBestOf != null) return defaultBestOf;
          const rf = tournamentFormat?.roundFormats;
          if (rf && typeof rf === "object") {
            const rn = booking.tournamentMatch?.roundNumber;
            const fromRound =
              rn != null
                ? rf[String(rn)] ?? rf[rn] ?? rf[String(booking.tournamentMatch?.roundType || "")]
                : null;
            const n = Number(fromRound ?? rf.default ?? rf.knockout);
            if (Number.isFinite(n) && n > 0) return n;
          }
          return null;
        })(),
      };
    });

    const tournamentMeta = {
      id: tournament.id,
      name: tournament.name,
      sport: tournament.sport,
      formatType: tournamentFormat?.type || null,
      scoringRules: scoringRulesRow
        ? {
          pointsWin: scoringRulesRow.pointsWin,
          pointsDraw: scoringRulesRow.pointsDraw,
          pointsLoss: scoringRulesRow.pointsLoss,
          pointsWalkover: scoringRulesRow.pointsWalkover,
          pointsDefaultWin: scoringRulesRow.pointsDefaultWin,
        }
        : null,
      withdrawalRules: tournament.withdrawalRules || null,
      defaultBestOfFrames: defaultBestOf,
    };

    res.json({
      success: true,
      data: formattedBookings,
      tournamentMeta,
      message: "Tournament matches retrieved successfully",
    });
  } catch (error) {
    console.error("[getTournamentBookings] Error:", {
      message: error.message,
      stack: error.stack,
      tournamentId: req.params.tournamentId,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ============================================
// GET MATCH DETAILS FOR A BOOKING
// ============================================
exports.getBookingDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { userId } = req.user;

    // Find player profile IDs (Unify by email for dual-role users)
    const playerIds = await getAllPlayerIdsForUser(userId);
    if (!playerIds || playerIds.length === 0) {
      return res.status(404).json({ success: false, error: "Player profile not found" });
    }

    // Get booking with all related details
    const booking = await Booking.findByPk(bookingId, {
      include: [
        {
          model: Player,
          as: "player",
          attributes: ["id", "name", "nickname"],
          include: [
            {
              model: User,
              as: "user",
              attributes: ["email"],
              required: false,
            },
          ],
          required: false,
        },
        {
          model: Player,
          as: "opponent",
          attributes: ["id", "name", "nickname"],
          include: [
            {
              model: User,
              as: "user",
              attributes: ["email"],
              required: false,
            },
          ],
          required: false,
        },
        {
          model: League,
          as: "league",
          attributes: ["id", "name", "sport", "format", "matchFormat", "gameType", "matchRules", "reporting"],
          required: false,
        },
        {
          model: Fixture,
          as: "fixture",
          attributes: ["id", "round", "matchNumber", "divisionId", "player1Id", "player2Id"],
          required: false,
          include: [
            {
              model: Division,
              as: "division",
              attributes: ["id", "name", "numberOfFrames", "raceLength"],
              required: false,
            },
          ],
        },
        {
          model: Tournament,
          as: "tournament",
          attributes: ["id", "name", "sport"],
          required: false,
        },
        {
          model: TournamentMatch,
          as: "tournamentMatch",
          attributes: [
            "id",
            "roundNumber",
            "matchNumber",
            "status",
            "player1Id",
            "player2Id",
            "bestOfFrames",
            "roundType",
          ],
          required: false,
        },
        {
          model: MatchResult,
          as: "matchResult",
          required: false,
        },
      ],
    });

    if (!booking) {
      return res.status(404).json({ success: false, error: "Booking not found" });
    }

    // DEBUG: Log reporting config presence
    console.log(`[getBookingDetails] League reporting config:`, {
      leagueId: booking.league?.id,
      hasReporting: !!booking.league?.reporting,
      reportingValue: booking.league?.reporting,
      reportingType: typeof booking.league?.reporting
    });

    // Verify player is involved in this match
    if (!playerIds.includes(booking.playerId) && !playerIds.includes(booking.opponentId)) {
      return res
        .status(403)
        .json({ success: false, error: "You are not a participant in this match" });
    }

    // Verify booking is confirmed
    if (booking.status !== "confirmed") {
      return res
        .status(400)
        .json({ success: false, error: "Booking must be confirmed before submitting result" });
    }

    // Check if result already exists
    if (booking.matchResult) {
      return res.status(400).json({
        success: false,
        error: "Result already submitted for this match",
        existingResult: {
          id: booking.matchResult.id,
          status: booking.matchResult.resultStatus,
          submittedBy: booking.matchResult.submittedBy,
        },
      });
    }

    const isTournamentBooking =
      String(booking.bookingType || "").toLowerCase() === "tournament" || !!booking.tournamentId;

    let tournamentFormatRow = null;
    let tournamentScoringRow = null;
    if (isTournamentBooking && booking.tournamentId) {
      tournamentFormatRow = await TournamentFormat.findOne({
        where: { tournamentId: booking.tournamentId },
        attributes: ["bestOfFrames", "roundFormats", "type"],
      });
      tournamentScoringRow = await TournamentScoringRules.findOne({
        where: { tournamentId: booking.tournamentId },
        attributes: ["pointsWin", "pointsDraw", "pointsLoss", "pointsWalkover", "pointsDefaultWin"],
      });
    }
    const defaultBestOfFromTournament =
      tournamentFormatRow?.bestOfFrames != null && Number(tournamentFormatRow.bestOfFrames) > 0
        ? Number(tournamentFormatRow.bestOfFrames)
        : null;

    // Determine match configuration based on sport
    let matchConfig = {};

    // Define default reporting configuration early so it's available for all sport types
    const defaultReporting = {
      method: "bothConfirm",
      adminApproval: false,
      photoProof: true,  // Default to required for better verification
      dispute: { enabled: true, timeLimit: 48 },  // Default to enabled for fairness
    };

    // Parse reporting JSON if it's a string
    let reportingConfig = {};
    try {
      if (booking.league?.reporting) {
        if (typeof booking.league.reporting === "string") {
          reportingConfig = JSON.parse(booking.league.reporting);
        } else {
          reportingConfig = booking.league.reporting;
        }
      }
    } catch (parseError) {
      console.warn('[getBookingDetails] Failed to parse reporting JSON:', parseError.message);
      reportingConfig = {};
    }

    const leagueReporting = { ...defaultReporting, ...reportingConfig };

    const effectiveSport = String(
      booking.sport || booking.league?.sport || booking.tournament?.sport || "snooker"
    ).toLowerCase();

    if (isTournamentBooking) {
      const tm = booking.tournamentMatch;
      let totalFrames = 7;
      if (tm?.bestOfFrames != null && Number(tm.bestOfFrames) > 0) {
        totalFrames = Number(tm.bestOfFrames);
      } else if (defaultBestOfFromTournament != null) {
        totalFrames = defaultBestOfFromTournament;
      } else if (tournamentFormatRow?.roundFormats != null && tm?.roundNumber != null) {
        let rf = tournamentFormatRow.roundFormats;
        if (typeof rf === "string") {
          try {
            rf = JSON.parse(rf);
          } catch {
            rf = {};
          }
        }
        const fromRound =
          rf?.[String(tm.roundNumber)] ?? rf?.[tm.roundNumber] ?? rf?.default ?? rf?.knockout;
        const n = Number(fromRound);
        if (Number.isFinite(n) && n > 0) totalFrames = n;
      }

      const framesToWin = Math.ceil(totalFrames / 2);
      const isPool = effectiveSport === "pool";
      const useFrameDetail =
        effectiveSport === "snooker" || effectiveSport === "pooker" || effectiveSport === "pool";
      matchConfig = {
        totalFrames,
        framesToWin,
        gameType: null,
        isBestOf: !isPool,
        isRaceTo: isPool,
        scoreDetail: useFrameDetail ? "frame_by_frame" : "total_only",
        matchFormat: isPool ? `Race to ${framesToWin}` : `Best of ${totalFrames}`,
        pointsSystem: null,
        matchRules: null,
        reporting: leagueReporting,
        handicap: null,
      };
    } else if (
      booking.league &&
      (String(booking.league.sport).toLowerCase() === "snooker" ||
        String(booking.league.sport).toLowerCase() === "pool" ||
        String(booking.league.sport).toLowerCase() === "pooker")
    ) {
      // Parse matchRules JSON string
      let rules = {};
      try {
        rules = booking.league.matchRules ? JSON.parse(booking.league.matchRules) : {};
      } catch (parseError) {
        console.warn('[getBookingDetails] Failed to parse matchRules JSON:', parseError.message);
        rules = {};
      }

      // Get handicap information for players if handicap is enabled
      let player1Handicap = 0;
      let player2Handicap = 0;
      let handicapInfo = null;

      if (rules.handicap?.enabled) {
        try {
          const p1LeaguePlayer = await LeaguePlayer.findOne({
            where: {
              leagueId: booking.leagueId,
              playerId: booking.playerId,
            },
            attributes: ["handicap", "rating"],
          });
          player1Handicap = p1LeaguePlayer?.handicap || 0;

          const p2LeaguePlayer = await LeaguePlayer.findOne({
            where: {
              leagueId: booking.leagueId,
              playerId: booking.opponentId,
            },
            attributes: ["handicap", "rating"],
          });
          player2Handicap = p2LeaguePlayer?.handicap || 0;

          handicapInfo = {
            enabled: true,
            type: rules.handicap.type || "manual",
            player1: player1Handicap,
            player2: player2Handicap,
            dynamic: rules.handicap.dynamic || false,
          };
        } catch (handicapError) {
          console.warn("[getBookingDetails] Failed to fetch handicap info:", handicapError.message);
          handicapInfo = { enabled: true, type: rules.handicap.type || "manual", player1: 0, player2: 0 };
        }
      }

      let totalFrames = 0;

      if (rules.bestOf) {
        if (rules.bestOf === "custom") {
          totalFrames = parseInt(rules.customFrames) || 1;
        } else {
          totalFrames = parseInt(rules.bestOf) || 1;
        }
      } else {
        const matchFormatStr = booking.league.matchFormat || "Best of 7";
        const m = matchFormatStr.match(/\d+/);
        totalFrames = m ? parseInt(m[0]) : 7;
      }

      let framesToWin = Math.ceil(totalFrames / 2);
      const formatStr = (booking.league.matchFormat || "").toLowerCase();
      if (booking.league.sport === "pool" && formatStr.includes("race to")) {
        const mRace = formatStr.match(/\d+/);
        framesToWin = mRace ? parseInt(mRace[0]) : framesToWin;
        if (!rules.bestOf) {
          totalFrames = 2 * framesToWin - 1;
        }
      }

      matchConfig = {
        totalFrames: totalFrames,
        framesToWin: framesToWin,
        gameType: booking.league.gameType || null,
        isBestOf: !formatStr.includes("race to"),
        isRaceTo: formatStr.includes("race to"),
        scoreDetail: rules.scoreDetail || "total_only",
        matchFormat:
          booking.league.matchFormat ||
          (formatStr.includes("race to") ? `Race to ${framesToWin}` : `Best of ${totalFrames}`),
        pointsSystem: booking.league.pointsSystem,
        matchRules: booking.league.matchRules,
        reporting: leagueReporting,
        handicap: handicapInfo,
      };

    } else if (!isTournamentBooking) {
      return res.status(400).json({
        success: false,
        error: "Booking is missing league or tournament context for score submission",
      });
    }

    let isOpponentPlayer1 = false;
    if (booking.fixture && booking.opponent?.id != null && booking.fixture.player1Id != null) {
      isOpponentPlayer1 = String(booking.fixture.player1Id) === String(booking.opponent.id);
    } else if (
      booking.tournamentMatch &&
      booking.opponent?.id != null &&
      booking.tournamentMatch.player1Id != null
    ) {
      isOpponentPlayer1 =
        String(booking.tournamentMatch.player1Id) === String(booking.opponent.id);
    }

    const p1Data = isOpponentPlayer1 ? booking.opponent : booking.player;
    const p2Data = isOpponentPlayer1 ? booking.player : booking.opponent;

    const responseLeague = booking.league
      ? {
        id: booking.league.id,
        name: booking.league.name,
        sport: booking.league.sport,
        format: booking.league.format,
        reporting: leagueReporting,
      }
      : {
        id: booking.tournamentId,
        name: booking.tournament?.name || "Tournament",
        sport: booking.tournament?.sport || booking.sport,
        format: tournamentFormatRow?.type || null,
        leagueType: "tournament",
        reporting: leagueReporting,
      };

    const responseFixture = booking.fixture
      ? {
        id: booking.fixture.id,
        round: booking.fixture.round,
        matchNumber: booking.fixture.matchNumber,
        division: booking.fixture.division?.name,
      }
      : booking.tournamentMatch
        ? {
          id: booking.tournamentMatch.id,
          round: booking.tournamentMatch.roundNumber,
          matchNumber: booking.tournamentMatch.matchNumber,
          division: null,
        }
        : null;

    const responseScoring =
      isTournamentBooking && tournamentScoringRow
        ? {
          pointsWin: tournamentScoringRow.pointsWin,
          pointsDraw: tournamentScoringRow.pointsDraw,
          pointsLoss: tournamentScoringRow.pointsLoss,
          pointsWalkover: tournamentScoringRow.pointsWalkover,
          pointsDefaultWin: tournamentScoringRow.pointsDefaultWin,
        }
        : null;

    const response = {
      sport: effectiveSport,
      matchType: isTournamentBooking ? "tournament" : "league",
      scoring: responseScoring,
      booking: {
        id: booking.id,
        fixtureId: booking.fixtureId,
        leagueId: booking.leagueId,
        tournamentId: booking.tournamentId,
        tournamentMatchId: booking.tournamentMatchId,
        bookingDate: booking.bookingDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
        tableNumber: booking.tableNumber,
        tableName: booking.tableName,
        sport: booking.sport,
        status: booking.status,
      },
      league: responseLeague,
      fixture: responseFixture,
      player1: {
        id: p1Data.id,
        name: p1Data.name,
        nickname: p1Data.nickname,
        email: p1Data.user?.email,
      },
      player2: {
        id: p2Data.id,
        name: p2Data.name,
        nickname: p2Data.nickname,
        email: p2Data.user?.email,
      },
      matchConfig,
      currentPlayerId: playerIds.find((id) => id === booking.playerId || id === booking.opponentId) || playerIds[0],
    };

      // DEBUG: Log response including reporting
      console.log(`[getBookingDetails] Response reporting:`, {
        leagueReporting: response.league?.reporting,
        matchConfigReporting: response.matchConfig?.reporting,
        photoProof: response.league?.reporting?.photoProof,
        disputeEnabled: response.league?.reporting?.dispute?.enabled
      });

      res.json({
        success: true,
        data: response,
        message: "Booking details retrieved successfully",
      });
    } catch (error) {
      console.error("[getBookingDetails] Error:", {
        message: error.message,
        stack: error.stack,
        bookingId: req.params.bookingId,
      });
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  // ============================================
  // SUBMIT MATCH RESULT
  // ============================================
  exports.submitMatchResult = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { userId } = req.user;
      let {
        bookingId,
        matchType = "league", // Default to league
        // Frontend sends these
        winnerId,
        loserId,
        winnerScore,
        loserScore,
        frameScores, // Array of frame/rack objects (sent as JSON string from FormData)
        pokerResult,
        notes,
      } = req.body;

      // Parse stringified JSON from FormData
      if (typeof frameScores === 'string') {
        try {
          frameScores = JSON.parse(frameScores);
        } catch (e) {
          await transaction.rollback();
          return res.status(400).json({ success: false, error: "Invalid frameScores format" });
        }
      }

      if (typeof pokerResult === 'string') {
        try {
          pokerResult = JSON.parse(pokerResult);
        } catch (e) {
          await transaction.rollback();
          return res.status(400).json({ success: false, error: "Invalid pokerResult format" });
        }
      }

      // Find player profile IDs (Unify by email for dual-role users)
      const playerIds = await getAllPlayerIdsForUser(userId, transaction);
      if (!playerIds || playerIds.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Player profile not found" });
      }

      // Get booking with related data
      const booking = await Booking.findByPk(bookingId, {
        include: [
          {
            model: League,
            as: "league",
          },
          {
            model: Fixture,
            as: "fixture",
            include: [{
              model: Division,
              as: "division",
              attributes: ["id", "name", "numberOfFrames", "raceLength"],
            }]
          },
          {
            model: TournamentMatch,
            as: "tournamentMatch",
            attributes: ["id", "player1Id", "player2Id", "roundNumber", "matchNumber"],
            required: false,
          },
          {
            model: MatchResult,
            as: "matchResult",
          },
        ],
        transaction,
      });

      if (!booking) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Booking not found" });
      }

      // Normalize sport name
      if (booking.sport && (booking.sport.toLowerCase() === 'poker' || booking.sport.toLowerCase() === 'pooker')) {
        booking.sport = 'pooker';
      }

      if (
        String(booking.bookingType || "").toLowerCase() === "tournament" ||
        booking.tournamentId
      ) {
        matchType = "tournament";
      }

      // Verify player is a participant
      const matchedPlayerId = playerIds.find(id => id === booking.playerId || id === booking.opponentId);
      if (!matchedPlayerId) {
        await transaction.rollback();
        return res
          .status(403)
          .json({ success: false, error: "You are not a participant in this match" });
      }

      // Verify booking is confirmed
      if (booking.status !== "confirmed") {
        await transaction.rollback();
        return res
          .status(400)
          .json({ success: false, error: "Booking must be confirmed before submitting result" });
      }

      // Check if result already exists
      if (booking.matchResult) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: "Result already submitted for this match",
        });
      }

      let actualPlayer1Id;
      let actualPlayer2Id;
      if (booking.tournamentMatch?.player1Id != null && booking.tournamentMatch?.player2Id != null) {
        actualPlayer1Id = booking.tournamentMatch.player1Id;
        actualPlayer2Id = booking.tournamentMatch.player2Id;
      } else if (booking.fixture?.player1Id != null && booking.fixture?.player2Id != null) {
        actualPlayer1Id = booking.fixture.player1Id;
        actualPlayer2Id = booking.fixture.player2Id;
      } else {
        actualPlayer1Id = booking.playerId;
        actualPlayer2Id = booking.opponentId;
      }

      console.log('[submitMatchResult] Player IDs:', {
        hasFixture: !!booking.fixture,
        hasTournamentMatch: !!booking.tournamentMatch,
        bookingPlayerId: booking.playerId,
        bookingOpponentId: booking.opponentId,
        fixturePlayer1Id: booking.fixture?.player1Id,
        fixturePlayer2Id: booking.fixture?.player2Id,
        bracketPlayer1Id: booking.tournamentMatch?.player1Id,
        bracketPlayer2Id: booking.tournamentMatch?.player2Id,
        actualPlayer1Id,
        actualPlayer2Id,
      });

      // 1. Parse League Rules & Handicaps
      let matchRules = {};
      try {
        if (booking.league?.matchRules) {
          matchRules = typeof booking.league.matchRules === 'string' ? JSON.parse(booking.league.matchRules) : booking.league.matchRules;
        }
      } catch (e) {
        console.warn('[submitMatchResult] Failed to parse matchRules:', e.message);
      }

      // For tournaments, get the tournament format to extract bestOfFrames
      let tournamentBestOfFrames = null;
      if (matchType === "tournament" && booking.tournamentId) {
        try {
          const tournamentFormat = await TournamentFormat.findOne({
            where: { tournamentId: booking.tournamentId },
            attributes: ["bestOfFrames"],
            transaction,
          });
          if (tournamentFormat?.bestOfFrames != null) {
            tournamentBestOfFrames = Number(tournamentFormat.bestOfFrames);
          }
        } catch (e) {
          console.warn('[submitMatchResult] Failed to fetch tournament bestOfFrames:', e.message);
        }
      }

      let p1Handicap = 0;
      let p2Handicap = 0;
      if (matchRules?.handicap?.enabled) {
        const p1lp = await LeaguePlayer.findOne({ where: { leagueId: booking.leagueId, playerId: actualPlayer1Id }, transaction });
        const p2lp = await LeaguePlayer.findOne({ where: { leagueId: booking.leagueId, playerId: actualPlayer2Id }, transaction });
        p1Handicap = p1lp?.handicap || 0;
        p2Handicap = p2lp?.handicap || 0;
      }

      // 2. Validate and determine sport type
      let resultData = {};

      // Handle walkovers
      if (req.body.isWalkover === 'true' || req.body.isWalkover === true) {
        const walkoverWinnerId = req.body.walkoverWinner || req.body.winnerId;
        const isP1Winner = walkoverWinnerId.toString() === actualPlayer1Id.toString();

        // Determine walkover score based on league rule (if configured), else fallback to bestOf.
        let winScore = null;
        let loseScore = 0;

        const walkoverRule = matchRules.walkover?.rule || null;
        const customWalkover = matchRules.walkover?.customScore || null;

        if (walkoverRule === 'autoBestOf' || !walkoverRule) {
          let totalFrames = 5;

          // For tournaments, use tournament bestOfFrames config
          if (matchType === "tournament" && tournamentBestOfFrames != null && tournamentBestOfFrames > 0) {
            totalFrames = tournamentBestOfFrames;
          } else if (matchRules.bestOf === 'custom') {
            totalFrames = parseInt(matchRules.customFrames) || 5;
          } else if (matchRules.bestOf) {
            totalFrames = parseInt(matchRules.bestOf) || 5;
          } else {
            const matchFormatStr = booking.league?.matchFormat || "";
            const m = matchFormatStr.match(/\d+/);
            if (m) {
              totalFrames = parseInt(m[0]);
            } else if (booking.fixture?.division?.numberOfFrames) {
              totalFrames = booking.fixture.division.numberOfFrames;
            } else if (booking.fixture?.division?.raceLength) {
              totalFrames = booking.fixture.division.raceLength * 2 - 1;
            }
          }
          winScore = totalFrames;
        } else if (walkoverRule === 'auto2-0') {
          winScore = 2;
        } else if (walkoverRule === 'auto5-0') {
          winScore = 5;
        } else if (walkoverRule === 'custom' && customWalkover) {
          const parsed = String(customWalkover).split('-').map(Number);
          if (parsed.length === 2 && !Number.isNaN(parsed[0]) && !Number.isNaN(parsed[1])) {
            winScore = parsed[0];
            loseScore = parsed[1];
          }
        }

        // Final fallback if rule-based calculation failed
        if (winScore === null) {
          let totalFrames = 5;

          // For tournaments, use tournament bestOfFrames config
          if (matchType === "tournament" && tournamentBestOfFrames != null && tournamentBestOfFrames > 0) {
            totalFrames = tournamentBestOfFrames;
          } else if (matchRules.bestOf === 'custom') {
            totalFrames = parseInt(matchRules.customFrames) || 5;
          } else if (matchRules.bestOf) {
            totalFrames = parseInt(matchRules.bestOf) || 5;
          } else {
            const matchFormatStr = booking.league?.matchFormat || "";
            const m = matchFormatStr.match(/\d+/);
            if (m) {
              totalFrames = parseInt(m[0]);
            } else if (booking.fixture?.division?.numberOfFrames) {
              totalFrames = booking.fixture.division.numberOfFrames;
            } else if (booking.fixture?.division?.raceLength) {
              totalFrames = booking.fixture.division.raceLength * 2 - 1;
            }
          }
          winScore = totalFrames;
        }

        const walkoverScore = isP1Winner ? `${winScore}-${loseScore}` : `${loseScore}-${winScore}`;

        resultData = {
          winnerId: walkoverWinnerId,
          isWalkover: true,
          walkoverScore: walkoverScore, // Store walkover score for display
        };

        if (booking.sport === 'pool') {
          resultData.player1RackWins = isP1Winner ? winScore : 0;
          resultData.player2RackWins = isP1Winner ? 0 : winScore;
        } else {
          resultData.player1Frames = isP1Winner ? winScore : 0;
          resultData.player2Frames = isP1Winner ? 0 : winScore;
        }
      } else if (booking.sport === "snooker") {
        let p1Frames = parseInt(req.body.player1Frames) || 0;
        let p2Frames = parseInt(req.body.player2Frames) || 0;
        let details = frameScores;

        if (frameScores && frameScores.length > 0) {
          // Count frame wins for each player from details if provided (Parse as numbers to avoid string comparison bug)
          p1Frames = details.filter(f => (parseInt(f.player1Score) || 0) > (parseInt(f.player2Score) || 0)).length;
          p2Frames = details.filter(f => (parseInt(f.player2Score) || 0) > (parseInt(f.player1Score) || 0)).length;
        } else if (p1Frames === 0 && p2Frames === 0) {
          await transaction.rollback();
          return res.status(400).json({ success: false, error: "Scores or frame details required for Snooker" });
        }

        // Apply handicap to Snooker (Frames)
        const adjP1 = p1Frames + p1Handicap;
        const adjP2 = p2Frames + p2Handicap;

        resultData = {
          player1Frames: p1Frames,
          player2Frames: p2Frames,
          snookerFrameDetails: details,
          winnerId: adjP1 > adjP2 ? actualPlayer1Id : adjP2 > adjP1 ? actualPlayer2Id : null,
        };

        // Check Draw Rules for Snooker
        // A draw is blocked ONLY if allowDraw is explicitly false, OR a noDrawRule method is configured
        const snookerShouldBlockDraw = matchRules.allowDraw === false ||
          (matchRules.noDrawRule && matchRules.noDrawRule !== 'none');
        if (adjP1 === adjP2 && snookerShouldBlockDraw && !winnerId) {
          // Automatic tie resolution for certain rules
          let autoWinnerId = null;
          if (matchRules.noDrawRule === 'mostPoints' && details && Array.isArray(details)) {
            // Sum all points for each player
            let p1Total = 0, p2Total = 0;
            details.forEach(f => {
              p1Total += parseInt(f.player1Score) || 0;
              p2Total += parseInt(f.player2Score) || 0;
            });
            if (p1Total > p2Total) autoWinnerId = actualPlayer1Id;
            else if (p2Total > p1Total) autoWinnerId = actualPlayer2Id;
          } else if (matchRules.noDrawRule === 'highestBreak' && details && Array.isArray(details)) {
            // Find highest break for each player
            let p1Max = 0, p2Max = 0;
            details.forEach(f => {
              const b1Val = f.player1Break !== undefined ? f.player1Break : f.player1HighestBreak;
              const b2Val = f.player2Break !== undefined ? f.player2Break : f.player2HighestBreak;
              const b1 = parseInt(b1Val) || 0;
              const b2 = parseInt(b2Val) || 0;
              if (b1 > p1Max) p1Max = b1;
              if (b2 > p2Max) p2Max = b2;
            });
            if (p1Max > p2Max) autoWinnerId = actualPlayer1Id;
            else if (p2Max > p1Max) autoWinnerId = actualPlayer2Id;
          }
          if (autoWinnerId) {
            resultData.winnerId = autoWinnerId;
          } else {
            await transaction.rollback();
            let noDrawMsg = "Match cannot end in a draw.";
            if (matchRules.noDrawRule === 'respottedBlack') noDrawMsg += " A Re-spotted Black must be played.";
            else if (matchRules.noDrawRule === 'mostPoints') noDrawMsg += " The player with the most points wins.";
            else if (matchRules.noDrawRule === 'blackFinish') noDrawMsg += " A Black Ball Finish must be played.";
            else noDrawMsg += " Please use a tie-break method.";
            return res.status(400).json({ success: false, error: noDrawMsg });
          }
        }

        // Extract highest break and 50+/100+ breaks if available in details
        if (details && Array.isArray(details)) {
          let maxBreak = 0;
          let breaks50 = 0;
          let breaks100 = 0;
          details.forEach(f => {
            // Frontend sends 'player1Break', backend expected 'player1HighestBreak' originally
            const b1Val = f.player1Break !== undefined ? f.player1Break : f.player1HighestBreak;
            const b2Val = f.player2Break !== undefined ? f.player2Break : f.player2HighestBreak;
            const b1 = parseInt(b1Val) || 0;
            const b2 = parseInt(b2Val) || 0;
            maxBreak = Math.max(maxBreak, b1, b2);
            if (b1 >= 100) breaks100++; else if (b1 >= 50) breaks50++;
            if (b2 >= 100) breaks100++; else if (b2 >= 50) breaks50++;
          });
          resultData.highestBreak = maxBreak;
          resultData.breaks50Plus = breaks50;
          resultData.breaks100Plus = breaks100;
        }
      } else if (booking.sport === "pool") {
        let p1Racks = parseInt(req.body.player1RackWins) || 0;
        let p2Racks = parseInt(req.body.player2RackWins) || 0;
        let details = frameScores;

        // Detect if this is a "Total Upload Score" submission (scoreDetail === 'points')
        // In that mode, player submits rack wins directly without per-rack breakdown
        const isTotalUploadScore = matchRules.scoreDetail === 'points';

        if (frameScores && frameScores.length > 0) {
          // Count rack wins for each player from details if provided (Parse as numbers to avoid string comparison bug)
          p1Racks = details.filter(r => (parseInt(r.player1Score) || 0) > (parseInt(r.player2Score) || 0)).length;
          p2Racks = details.filter(r => (parseInt(r.player2Score) || 0) > (parseInt(r.player1Score) || 0)).length;
        } else if (p1Racks === 0 && p2Racks === 0 && !isTotalUploadScore) {
          // Only reject 0-0 when NOT in Total Upload Score mode (in that mode, 0 is a valid score)
          await transaction.rollback();
          return res.status(400).json({ success: false, error: "Scores or rack details required for Pool" });
        } else if (p1Racks === 0 && p2Racks === 0 && isTotalUploadScore) {
          // In Total Upload Score mode, require at least a score to be non-zero unless explicitly a 0-0 walkover
          await transaction.rollback();
          return res.status(400).json({ success: false, error: "Total rack score required for Pool. Please enter the rack wins for each player." });
        }

        // Apply handicap to Pool (Racks)
        const adjP1 = p1Racks + p1Handicap;
        const adjP2 = p2Racks + p2Handicap;

        resultData = {
          player1RackWins: p1Racks,
          player2RackWins: p2Racks,
          poolRackDetails: details,
          winnerId: adjP1 > adjP2 ? actualPlayer1Id : adjP2 > adjP1 ? actualPlayer2Id : null,
        };

        // Check Draw Rules for Pool (applies to both frame-by-frame AND Total Upload Score)
        // A draw is blocked ONLY if allowDraw is explicitly false, OR a noDrawRule method is configured
        const poolShouldBlockDraw = matchRules.allowDraw === false ||
          (matchRules.noDrawRule && matchRules.noDrawRule !== 'none');
        if (adjP1 === adjP2 && poolShouldBlockDraw && !winnerId) {
          // Automatic tie resolution for certain rules
          let autoWinnerId = null;
          if (matchRules.noDrawRule === 'mostPoints' && details && Array.isArray(details)) {
            let p1Total = 0, p2Total = 0;
            details.forEach(r => {
              p1Total += parseInt(r.player1Score) || 0;
              p2Total += parseInt(r.player2Score) || 0;
            });
            if (p1Total > p2Total) autoWinnerId = actualPlayer1Id;
            else if (p2Total > p1Total) autoWinnerId = actualPlayer2Id;
          } else if (matchRules.noDrawRule === 'highestBreak' && details && Array.isArray(details)) {
            let p1Max = 0, p2Max = 0;
            details.forEach(r => {
              const b1 = parseInt(r.player1Break) || 0;
              const b2 = parseInt(r.player2Break) || 0;
              if (b1 > p1Max) p1Max = b1;
              if (b2 > p2Max) p2Max = b2;
            });
            if (p1Max > p2Max) autoWinnerId = actualPlayer1Id;
            else if (p2Max > p1Max) autoWinnerId = actualPlayer2Id;
          }
          if (autoWinnerId) {
            resultData.winnerId = autoWinnerId;
          } else {
            await transaction.rollback();
            let noDrawMsg = "Match cannot end in a draw.";
            if (matchRules.noDrawRule === 'respottedBlack') noDrawMsg += " A Re-spotted Black must be played.";
            else if (matchRules.noDrawRule === 'mostPoints') noDrawMsg += " The player with the most points wins.";
            else if (matchRules.noDrawRule === 'blackFinish') noDrawMsg += " A Black Ball Finish must be played.";
            else noDrawMsg += " Please use a tie-break method.";
            return res.status(400).json({ success: false, error: noDrawMsg });
          }
        }

        // Extract balls potted/conceded and 7-ball wins
        if (details && Array.isArray(details)) {
          let p1Potted = 0, p2Potted = 0;
          let p1Seven = 0, p2Seven = 0;
          details.forEach(r => {
            p1Potted += (parseInt(r.player1BallsPotted) || 0);
            p2Potted += (parseInt(r.player2BallsPotted) || 0);
            if (r.isSevenBallWin && r.winnerId === actualPlayer1Id.toString()) p1Seven++;
            if (r.isSevenBallWin && r.winnerId === actualPlayer2Id.toString()) p2Seven++;
          });
          resultData.player1BallsPotted = p1Potted;
          resultData.player2BallsPotted = p2Potted;
          resultData.player1SevenBallWins = p1Seven;
          resultData.player2SevenBallWins = p2Seven;

          // Calculate highest break for Pool (even if non-standard, show if submitted)
          let maxBreak = 0;
          details.forEach(r => {
            const b1 = parseInt(r.player1Break) || 0;
            const b2 = parseInt(r.player2Break) || 0;
            maxBreak = Math.max(maxBreak, b1, b2);
          });
          resultData.highestBreak = maxBreak;
        }
      } else if (booking.sport === "pooker") {
        console.log('[submitMatchResult] Pooker submission - req.body:', {
          player1Frames: req.body.player1Frames,
          player2Frames: req.body.player2Frames,
          frameScores: frameScores?.length,
          winnerId
        });
        let p1Frames = parseInt(req.body.player1Frames) || 0;
        let p2Frames = parseInt(req.body.player2Frames) || 0;
        let details = frameScores;

        if (frameScores && frameScores.length > 0) {
          // Enforce Pooker specific validation
          let invalidPookerFrames = false;
          details.forEach(f => {
            if (f.player1Score !== '' || f.player2Score !== '') {
              if (f.player1BallsPotted == null || f.player1BallsPotted === '' || f.player2BallsPotted == null || f.player2BallsPotted === '') {
                invalidPookerFrames = true;
              }
            }
          });

          if (invalidPookerFrames) {
            await transaction.rollback();
            return res.status(400).json({ success: false, error: "Balls potted data is strictly required for each played Pooker frame." });
          }

          // Count frame wins for each player from details (Parse as numbers to avoid string comparison bug)
          p1Frames = details.filter(f => (parseInt(f.player1Score) || 0) > (parseInt(f.player2Score) || 0)).length;
          p2Frames = details.filter(f => (parseInt(f.player2Score) || 0) > (parseInt(f.player1Score) || 0)).length;
        } else if (p1Frames === 0 && p2Frames === 0) {
          await transaction.rollback();
          return res.status(400).json({ success: false, error: "Scores or frame details required for Pooker" });
        }

        // Apply handicap to Pooker (Frames)
        const adjP1 = p1Frames + p1Handicap;
        const adjP2 = p2Frames + p2Handicap;

        resultData = {
          player1Frames: p1Frames,
          player2Frames: p2Frames,
          pookerFrameDetails: details,
          winnerId: adjP1 > adjP2 ? actualPlayer1Id : adjP2 > adjP1 ? actualPlayer2Id : null,
        };

        // Check Draw Rules for Pooker
        // A draw is blocked ONLY if allowDraw is explicitly false, OR a noDrawRule method is configured
        const pookerShouldBlockDraw = matchRules.allowDraw === false ||
          (matchRules.noDrawRule && matchRules.noDrawRule !== 'none');
        if (adjP1 === adjP2 && pookerShouldBlockDraw && !winnerId) {
          // Automatic tie resolution for certain rules
          let autoWinnerId = null;
          if (matchRules.noDrawRule === 'mostPoints' && details && Array.isArray(details)) {
            let p1Total = 0, p2Total = 0;
            details.forEach(f => {
              p1Total += parseInt(f.player1Score) || 0;
              p2Total += parseInt(f.player2Score) || 0;
            });
            if (p1Total > p2Total) autoWinnerId = actualPlayer1Id;
            else if (p2Total > p1Total) autoWinnerId = actualPlayer2Id;
          } else if (matchRules.noDrawRule === 'highestBreak' && details && Array.isArray(details)) {
            let p1Max = 0, p2Max = 0;
            details.forEach(f => {
              const b1 = parseInt(f.player1Break) || 0;
              const b2 = parseInt(f.player2Break) || 0;
              if (b1 > p1Max) p1Max = b1;
              if (b2 > p2Max) p2Max = b2;
            });
            if (p1Max > p2Max) autoWinnerId = actualPlayer1Id;
            else if (p2Max > p1Max) autoWinnerId = actualPlayer2Id;
          }
          if (autoWinnerId) {
            resultData.winnerId = autoWinnerId;
          } else {
            await transaction.rollback();
            let noDrawMsg = "Match cannot end in a draw.";
            if (matchRules.noDrawRule === 'respottedBlack') noDrawMsg += " A Re-spotted Black must be played.";
            else if (matchRules.noDrawRule === 'mostPoints') noDrawMsg += " The player with the most points wins.";
            else if (matchRules.noDrawRule === 'blackFinish') noDrawMsg += " A Black Ball Finish must be played.";
            else noDrawMsg += " Please use a tie-break method.";
            return res.status(400).json({ success: false, error: noDrawMsg });
          }
        }

        // Extract Pooker stats: balls potted, black finishes, whitewash wins, seven ball wins
        if (details && Array.isArray(details)) {
          let p1Potted = 0, p2Potted = 0;
          let p1Black = 0, p2Black = 0;
          let p1White = 0, p2White = 0;
          let p1Seven = 0, p2Seven = 0;
          details.forEach(f => {
            p1Potted += (parseInt(f.player1BallsPotted) || 0);
            p2Potted += (parseInt(f.player2BallsPotted) || 0);
            if (f.isBlackFinish && f.winnerId === actualPlayer1Id.toString()) p1Black++;
            if (f.isBlackFinish && f.winnerId === actualPlayer2Id.toString()) p2Black++;
            if (f.isWhitewash && f.winnerId === actualPlayer1Id.toString()) p1White++;
            if (f.isWhitewash && f.winnerId === actualPlayer2Id.toString()) p2White++;
            // Automatic 7-ball win detection for Pooker if 7 balls are potted by the winner
            if ((f.isSevenBallWin || parseInt(f.player1BallsPotted) === 7) && f.winnerId === actualPlayer1Id.toString()) p1Seven++;
            if ((f.isSevenBallWin || parseInt(f.player2BallsPotted) === 7) && f.winnerId === actualPlayer2Id.toString()) p2Seven++;
          });
          resultData.player1BallsPotted = p1Potted;
          resultData.player2BallsPotted = p2Potted;
          resultData.player1BlackFinishes = p1Black;
          resultData.player2BlackFinishes = p2Black;
          resultData.player1WhitewashWins = p1White;
          resultData.player2WhitewashWins = p2White;
          resultData.player1SevenBallWins = p1Seven;
          resultData.player2SevenBallWins = p2Seven;

          // Calculate highest break for Pooker
          let maxBreak = 0;
          details.forEach(f => {
            const b1 = parseInt(f.player1Break) || 0;
            const b2 = parseInt(f.player2Break) || 0;
            maxBreak = Math.max(maxBreak, b1, b2);
          });
          resultData.highestBreak = maxBreak;
        }
      }

      // Get confirmation rules from league reporting configuration (tournament bookings use defaults when no league)
      let reportingConfig = { method: 'bothConfirm' };
      try {
        if (booking.league?.reporting) {
          if (typeof booking.league.reporting === 'string') {
            reportingConfig = { ...reportingConfig, ...JSON.parse(booking.league.reporting) };
          } else {
            reportingConfig = { ...reportingConfig, ...booking.league.reporting };
          }
        }
      } catch (parseError) {
        console.warn('[submitMatchResult] Failed to parse reporting JSON:', parseError.message);
      }
      const confirmationMethod = reportingConfig.method || 'bothConfirm';

      // Check if photo proof is required (skip for walkovers)
      const isWalkover = req.body.isWalkover === 'true' || req.body.isWalkover === true;
      const photoProofRequired = reportingConfig.photoProof === true && !isWalkover;
      if (photoProofRequired && !req.file) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: "Photo proof is required for this league. Please upload a match image."
        });
      }

      const noDrawRule = matchRules.noDrawRule || 'none';

      // Determine winner based on computed scores and tie-break fallback.
      const p1Score = resultData.player1Frames !== undefined ? resultData.player1Frames : (resultData.player1RackWins || 0);
      const p2Score = resultData.player2Frames !== undefined ? resultData.player2Frames : (resultData.player2RackWins || 0);
      const scoreWinnerId = p1Score > p2Score ? actualPlayer1Id : p2Score > p1Score ? actualPlayer2Id : null;

      console.log('[submitMatchResult] Winner determination:', {
        bookingSport: booking.sport,
        p1Score, p2Score,
        actualPlayer1Id, actualPlayer2Id,
        scoreWinnerId,
        manuallyProvidedWinnerId: winnerId,
        resultDataWinnerId: resultData.winnerId
      });

      let finalWinnerId = null;
      if (scoreWinnerId) {
        finalWinnerId = scoreWinnerId;
      } else if (winnerId) {
        // only accept manually supplied winner for valid tie-break cases
        finalWinnerId = winnerId;
      } else if (resultData.winnerId) {
        finalWinnerId = resultData.winnerId;
      }

      // Make sure the resultData stays aligned for later operations.
      if (finalWinnerId) {
        resultData.winnerId = finalWinnerId;
      }

      if (noDrawRule !== 'none' && !finalWinnerId && !isWalkover) {
        // Check if it's actually a draw in frames/racks
        // NOTE: p1Score/p2Score may reflect penalty/handicap evaluation and must be consistent.

        if (p1Score === p2Score) {
          await transaction.rollback();
          let ruleLabel = "a tie-break winner";
          if (noDrawRule === 'respottedBlack') ruleLabel = "a Re-spotted Black winner";
          else if (noDrawRule === 'mostPoints') ruleLabel = "a Most Points winner";
          else if (noDrawRule === 'blackFinish') ruleLabel = "a Black Ball Finish winner";

          return res.status(400).json({
            success: false,
            error: `This league does not allow draws. Please specify ${ruleLabel}.`
          });
        }
      }

      // Determine result status and notification behavior based on confirmation rules
      let resultStatus = 'Pending';
      let needsNotification = true;
      let notificationRecipient = null;

      // Is admin approval required for this league?
      const requiresAdminApproval = reportingConfig?.adminApproval === true;
      const disputeEnabled = reportingConfig?.dispute?.enabled !== false;

      // Walkovers require admin confirmation by default in this system
      if (isWalkover) {
        resultStatus = 'Awaiting Admin Approval';
        needsNotification = true;
        notificationRecipient = null; // Admin only, don't notify opponent
      } else {
        switch (confirmationMethod) {
          case 'bothConfirm':
            // For bothConfirm, opponent confirmation is required regardless of dispute flag.
            resultStatus = 'Pending';
            needsNotification = true;
            notificationRecipient = booking.playerId === matchedPlayerId ? booking.opponentId : booking.playerId;
            break;
          case 'oneSubmit':
            // If no admin approval is needed, it's confirmed immediately.
            // Otherwise, it goes to admin approval.
            resultStatus = requiresAdminApproval ? 'Awaiting Admin Approval' : 'Confirmed';
            needsNotification = true;
            notificationRecipient = booking.playerId === matchedPlayerId ? booking.opponentId : booking.playerId;
            break;
          case 'admin':
          case 'adminOnly':
            // Submitter sends directly to admin
            resultStatus = 'Awaiting Admin Approval';
            needsNotification = true;
            notificationRecipient = null; // Admin notified separately
            break;
          case 'none':
            resultStatus = 'Confirmed';
            needsNotification = false;
            break;
          default:
            resultStatus = 'Pending';
            needsNotification = true;
            notificationRecipient = booking.playerId === matchedPlayerId ? booking.opponentId : booking.playerId;
        }
      }

      // Create match result with appropriate status
      const matchResult = await MatchResult.create(
        {
          bookingId: booking.id,
          fixtureId: booking.fixtureId,
          leagueId: matchType === "league" ? booking.leagueId : null,
          tournamentId: matchType === "tournament" ? booking.tournamentId : null,
          matchType,
          sport: booking.sport,
          submittedBy: matchedPlayerId,
          player1Id: actualPlayer1Id,
          player2Id: actualPlayer2Id,
          ...resultData,
          isWalkover: isWalkover, // Explicitly set top-level flag for walkovers
          winnerId: finalWinnerId, // Prefer computed winner; fallback to submitted winner if no scores exist.
          resultStatus: resultStatus,
          submittedAt: new Date(),
          tieBreakWinnerId: req.body.winnerId || null,
          tieBreakMethod: req.body.tieBreakMethod || null,
          notes,
          imageUrl: req.file ? req.file.path : null, // Store Cloudinary URL if image was uploaded
        },
        { transaction }
      );

      // Send walkover email to opponent (non-blocking)
      if (isWalkover) {
        const submitterPlayer = await Player.findByPk(matchedPlayerId, { attributes: ["id", "name", "nickname"] });
        const opponentPlayerId = matchedPlayerId === booking.playerId ? booking.opponentId : booking.playerId;
        const opponentPlayer = await Player.findByPk(opponentPlayerId, {
          attributes: ["id", "name", "nickname"],
          include: [{ model: User, as: "user", attributes: ["email"] }]
        });

        if (opponentPlayer && opponentPlayer.user && opponentPlayer.user.email) {
          sendWalkoverSubmittedEmail({
            opponentEmail: opponentPlayer.user.email,
            opponentName: opponentPlayer.nickname || opponentPlayer.name,
            submitterName: submitterPlayer ? (submitterPlayer.nickname || submitterPlayer.name) : 'Your opponent',
            leagueName: booking.league?.name || 'League Match',
            fixtureRound: booking.fixture?.round || 'N/A',
            matchDetails: { sport: booking.sport },
            walkoverReason: req.body.walkoverReason || null
          }).catch(err => console.error('[submitMatchResult] Walkover email error:', err));
        }
      }

      // Walkover fixture / follow-up (uses matchResult from create above)
      if (isWalkover) {
        // FIXTURE UPDATE: Update fixture only when confirmed. Pending walkovers are held for admin approval.
        const resultDataObj = typeof matchResult.resultData === 'string' ? JSON.parse(matchResult.resultData || '{}') : (matchResult.resultData || {});
        const isWalkoverMatch = resultDataObj.isWalkover || resultDataObj.isManualWalkover || matchResult.isWalkover;

        if (booking.fixtureId && resultStatus === 'Confirmed') {
          const fixture = await Fixture.findByPk(booking.fixtureId, { transaction });
          if (fixture) {
            const updateData = {
              winnerId: matchResult.winnerId,
              loserId: matchResult.winnerId === matchResult.player1Id ? matchResult.player2Id : matchResult.player1Id,
            };

            // For confirmed results or walkovers, mark fixture as completed
            if (resultStatus === 'Confirmed' || isWalkoverMatch) {
              updateData.status = "completed";
            }

            if (matchResult.sport === "snooker") {
              updateData.player1Frames = matchResult.player1Frames;
              updateData.player2Frames = matchResult.player2Frames;
              // For walkovers, preserve the entire resultData (which includes walkoverScore); otherwise use frameDetails
              updateData.resultData = isWalkoverMatch ? matchResult.resultData : matchResult.snookerFrameDetails;
            } else if (matchResult.sport === "pool") {
              updateData.player1RackWins = matchResult.player1RackWins;
              updateData.player2RackWins = matchResult.player2RackWins;
              updateData.resultData = isWalkoverMatch ? matchResult.resultData : matchResult.poolRackDetails;
            } else if (matchResult.sport === "pooker") {
              updateData.player1Frames = matchResult.player1Frames;
              updateData.player2Frames = matchResult.player2Frames;
              updateData.player1RackWins = matchResult.player1Frames;
              updateData.player2RackWins = matchResult.player2Frames;
              updateData.resultData = isWalkoverMatch ? matchResult.resultData : (matchResult.pookerFrameDetails || matchResult.pokerResults);
            }

            await fixture.update(updateData, { transaction });
          }
        }
      }

      // AUTO-FINALIZATION: If result is Confirmed (oneSubmit method), complete booking
      if (resultStatus === 'Confirmed') {
        // Update booking status to "completed"
        await booking.update({ status: "completed" }, { transaction });

        // Finalize player badges (Casual -> Verified)
        if (matchType === "league" && booking.leagueId) {
          const player1 = await Player.findByPk(booking.playerId, { transaction });
          const player2 = await Player.findByPk(booking.opponentId, { transaction });

          if (player1 && player1.badgeType === "Casual") {
            await player1.update({ badgeType: "Verified" }, { transaction });
          }
          if (player2 && player2.badgeType === "Casual") {
            await player2.update({ badgeType: "Verified" }, { transaction });
          }
        }

        // Background Standing Update (handled after commit)
      }

      // Create notification only if needed
      if (needsNotification && notificationRecipient) {
        // Determine opponent player ID (using string comparison for robustness)
        const opponentPlayerId = booking.playerId.toString() === matchedPlayerId.toString() ? booking.opponentId : booking.playerId;

        // Get submitter and opponent details for notification
        const submitter = await Player.findByPk(matchedPlayerId, {
          attributes: ["id", "name", "nickname"],
          transaction
        });

        const opponent = await Player.findByPk(opponentPlayerId, {
          attributes: ["id", "name", "nickname"],
          include: [{ model: User, as: "user", attributes: ["email"] }],
          transaction
        });

        // Special message for resolved draws
        const isResolvedDraw = matchResult.player1Frames === matchResult.player2Frames || matchResult.player1RackWins === matchResult.player2RackWins;
        const winnerName = matchResult.winnerId === submitter.id ? (submitter.name || submitter.nickname) : (opponent.name || opponent.nickname);

        let notificationMessage = `${submitter.name || submitter.nickname} has submitted a match result. Please review and confirm or dispute.`;
        if (isResolvedDraw && matchResult.winnerId) {
          notificationMessage = `${submitter.name || submitter.nickname} submitted a match draw, with ${winnerName} decided as the winner. Please confirm.`;
        }

        // Create notification for opponent to confirm/dispute
        await Notification.create(
          {
            recipientId: opponentPlayerId,
            senderId: matchedPlayerId,
            type: "match_result_confirmation",
            relatedEntityType: "match_result",
            relatedEntityId: matchResult.id,
            title: isResolvedDraw && matchResult.winnerId ? "Match Result (Draw Decision)" : "Match Result Awaiting Confirmation",
            message: notificationMessage,
            status: "unread",
            actionStatus: "awaiting_confirmation",
            metadata: {
              bookingId: booking.id,
              sport: booking.sport,
              matchType,
              winnerId: matchResult.winnerId,
              submitterName: submitter.name || submitter.nickname,
              imageUrl: matchResult.imageUrl,
            },
          },
          { transaction }
        );

        // Send email to opponent if they have an email address
        if (opponent && opponent.user && opponent.user.email) {
          let scoreSummary = '';
          if (String(booking.sport).toLowerCase() === 'snooker' || String(booking.sport).toLowerCase() === 'pooker') {
            scoreSummary = `${matchResult.player1Frames} - ${matchResult.player2Frames} (Frames)`;
          } else if (booking.sport === 'pool') {
            scoreSummary = `${matchResult.player1RackWins} - ${matchResult.player2RackWins} (Racks)`;
          } else if (booking.sport === 'pooker') {
            scoreSummary = 'Poker Match Result';
          }

          sendMatchResultSubmissionEmail({
            opponentEmail: opponent.user.email,
            opponentName: opponent.name || opponent.nickname,
            submitterName: submitter.name || submitter.nickname,
            matchDetails: { sport: booking.sport },
            leagueName: booking.league?.name || "League Match",
            scoreSummary
          }).catch(err => console.error('[submitMatchResult] Error sending email:', err));
        }
      }

      await transaction.commit();

      // Trigger standings update if result was auto-confirmed
      if (resultStatus === 'Confirmed' && matchType === 'league' && booking.leagueId) {
        standingsService.updateLeagueStandings(booking.leagueId).catch(err => {
          console.error(`[submitMatchResult] Error updating standings for league ${booking.leagueId}:`, err);
        });

        // Special handling for Swiss round progression
        const { checkAndUpdateSwissPairings } = require('../services/fixtureGenerator');
        if (booking.league?.format === 'swiss' || booking.league?.leagueType === 'swiss') {
          checkAndUpdateSwissPairings(booking.leagueId, booking.fixture?.round || 1, booking.fixture?.divisionId)
            .catch(err => console.error('[submitMatchResult] Swiss update error:', err.message));
        }

        // Automatic knockout advancement for Straight Knockout leagues
        const { advanceKnockoutWinner } = require('../services/fixtureGenerator');
        const isKnockout = (booking.league?.format === 'knockout' || booking.league?.format === 'double_elimination' || booking.league?.format === 'groupsKnockout');
        // Also check if fixture has knockout stage
        const fixture = await Fixture.findByPk(booking.fixtureId);
        const isKnockoutStage = fixture?.stage === 'knockout' || fixture?.stage === 'groupsKnockout';
        if ((isKnockout || isKnockoutStage) && matchResult.winnerId && booking.fixtureId) {
          console.log(`[submitMatchResult] Auto-advancing knockout winner for fixture ${booking.fixtureId}, isKnockoutStage: ${isKnockoutStage}`);
          advanceKnockoutWinner(booking.fixtureId, matchResult.winnerId).catch(err => {
            console.error(`[submitMatchResult] Knockout advancement error:`, err.message);
          });
        }
      }

      // Fetch complete result with associations
      const completeResult = await MatchResult.findByPk(matchResult.id, {
        include: [
          {
            model: Player,
            as: "player1",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: Player,
            as: "player2",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: Player,
            as: "winner",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: Booking,
            as: "booking",
            attributes: ["id", "bookingDate", "startTime"],
          },
        ],
      });

      // Determine success message based on confirmation method
      let successMessage = "Match result submitted successfully.";
      if (confirmationMethod === 'bothConfirm') {
        successMessage += " Awaiting opponent confirmation.";
      } else if (confirmationMethod === 'oneSubmit') {
        successMessage += " Result recorded immediately.";
      } else if (confirmationMethod === 'adminOnly') {
        successMessage += " Awaiting admin approval.";
      } else if (confirmationMethod === 'none') {
        successMessage += " Result recorded immediately.";
      }

      res.status(201).json({
        success: true,
        data: completeResult,
        message: successMessage,
      });
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      console.error("submitMatchResult error:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  };

  // ============================================
  // CONFIRM MATCH RESULT
  // ============================================
  exports.confirmMatchResult = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { userId } = req.user;
      const { resultId } = req.params;
      const { confirmed } = req.body; // true to confirm, false to dispute

      // Get all player profile IDs (Unify by email for dual-role users)
      const playerIds = await getAllPlayerIdsForUser(userId, transaction);
      if (!playerIds || playerIds.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Player profile not found" });
      }

      // Get match result
      const matchResult = await MatchResult.findByPk(resultId, {
        include: [
          {
            model: Booking,
            as: "booking",
          },
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "reporting", "organizationId"],
          },
          {
            model: Tournament,
            as: "tournament",
            attributes: ["id", "name", "tier", "organizationId"],
          },
        ],
        transaction,
      });

      if (!matchResult) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Match result not found" });
      }

      // Normalize sport name
      if (matchResult.sport && (matchResult.sport.toLowerCase() === 'poker' || matchResult.sport.toLowerCase() === 'pooker')) {
        matchResult.sport = 'pooker';
      }

      // Verify result is in a status that allows confirmation/dispute (not already resolved or voided)
      const allowedStatuses = ["Pending", "Disputed", "Confirmed", "Awaiting Admin Approval"];
      if (!allowedStatuses.includes(matchResult.resultStatus)) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ success: false, error: "Result has already been processed" });
      }

      // Verify player is the opponent (not the submitter)
      const opponentId =
        matchResult.player1Id === matchResult.submittedBy
          ? matchResult.player2Id
          : matchResult.player1Id;

      // Check if any of the user's player IDs match the opponent ID
      const matchedOpponentId = playerIds.find(id => id === opponentId);
      if (!matchedOpponentId) {
        await transaction.rollback();
        return res
          .status(403)
          .json({ success: false, error: "Only the opponent can confirm this result" });
      }

      // Predict if user is also the submitter (shouldn't happen if opponentId logic is correct, but for safety)
      if (playerIds.includes(matchResult.submittedBy)) {
        await transaction.rollback();
        return res
          .status(403)
          .json({ success: false, error: "You cannot confirm your own submitted result" });
      }

      // Use the specific player ID that matches the opponentId for confirming
      const signingPlayerId = matchedOpponentId;

      if (confirmed) {
        const reportingConfig = parseReportingConfig(matchResult.league?.reporting, matchResult.booking?.league?.reporting);
        const requiresAdminApproval = reportingConfig.adminApproval === true;
        const targetStatus = requiresAdminApproval ? "Awaiting Admin Approval" : "Confirmed";

        // Update result status
        await matchResult.update(
          {
            resultStatus: targetStatus,
            confirmedBy: signingPlayerId,
            confirmedAt: new Date(),
          },
          { transaction }
        );

        // Update the notification status
        await Notification.update(
          {
            status: "actioned",
            actionStatus: requiresAdminApproval ? "awaiting_confirmation" : "confirmed",
          },
          {
            where: {
              relatedEntityType: "match_result",
              relatedEntityId: resultId,
              recipientId: { [Op.in]: playerIds }, // Use Op.in to catch notifications sent to any of user's profiles
            },
            transaction,
          }
        );

        // Only finalize match (update standings, fixtures, etc.) if it doesn't need admin approval
        if (!requiresAdminApproval) {
          // Tournament flow: keep TournamentMatch status and currentRound in sync.
          if (matchResult.matchType === "tournament" && matchResult.tournamentId) {
            await syncTournamentMatchCompletion({
              tournamentId: matchResult.tournamentId,
              player1Id: matchResult.player1Id,
              player2Id: matchResult.player2Id,
              matchResult,
              transaction,
            });
          }

          // Update booking status to "completed" (if booking exists)
          if (matchResult.booking) {
            await matchResult.booking.update(
              {
                status: "completed",
              },
              { transaction }
            );
          }

          // If there's a fixture, update it as well
          if (matchResult.fixtureId) {
            const fixture = await Fixture.findByPk(matchResult.fixtureId, { transaction });
            if (fixture) {
              // Check if this is a draw (equal scores)
              const p1Score = matchResult.sport === "pool"
                ? (matchResult.player1RackWins ?? matchResult.player1Frames ?? 0)
                : (matchResult.player1Frames ?? 0);
              const p2Score = matchResult.sport === "pool"
                ? (matchResult.player2RackWins ?? matchResult.player2Frames ?? 0)
                : (matchResult.player2Frames ?? 0);
              const isDraw = p1Score === p2Score && p1Score > 0;

              const updateData = {
                status: "completed",
              };

              // For draws, set both winnerId and loserId to null
              if (isDraw) {
                updateData.winnerId = null;
                updateData.loserId = null;
              } else {
                updateData.winnerId = matchResult.winnerId;
                updateData.loserId =
                  matchResult.winnerId === matchResult.player1Id
                    ? matchResult.player2Id
                    : matchResult.player1Id;
              }

              if (matchResult.sport === "snooker") {
                updateData.player1Frames = matchResult.player1Frames;
                updateData.player2Frames = matchResult.player2Frames;
                updateData.resultData = matchResult.snookerFrameDetails;
              } else if (matchResult.sport === "pool") {
                updateData.player1RackWins = matchResult.player1RackWins;
                updateData.player2RackWins = matchResult.player2RackWins;
                updateData.resultData = matchResult.poolRackDetails;
              } else if (matchResult.sport === "pooker") {
                // Pooker uses frames (like snooker)
                updateData.player1Frames = matchResult.player1Frames;
                updateData.player2Frames = matchResult.player2Frames;
                updateData.resultData = matchResult.pookerFrameDetails;
              }

              await fixture.update(updateData, { transaction });
            }
          }

          // ✅ BADGE TYPE LOGIC: Update players from "Casual" to "Verified" on first official match
          if (matchResult.matchType === "league" && matchResult.leagueId) {
            const player1 = await Player.findByPk(matchResult.player1Id, { transaction });
            const player2 = await Player.findByPk(matchResult.player2Id, { transaction });

            if (player1 && player1.badgeType === "Casual") {
              await player1.update({ badgeType: "Verified" }, { transaction });
            }
            if (player2 && player2.badgeType === "Casual") {
              await player2.update({ badgeType: "Verified" }, { transaction });
            }
          }
        } else {
          // If it requires admin approval, notify the organization
          const organization = await Organization.findByPk(matchResult.league.organizationId, { transaction });
          if (organization && organization.userId) {
            // Find the player profile for the organization's user to satisfy the foreign key constraint
            const orgPlayer = await Player.findOne({ where: { userId: organization.userId }, transaction });
            if (orgPlayer) {
              await Notification.create({
                recipientId: orgPlayer.id,
                type: "league_update", // use valid enum
                relatedEntityType: "match_result",
                relatedEntityId: matchResult.id,
                title: "Match Result Awaiting Admin Approval",
                message: `A match result in league "${matchResult.league.name}" has been confirmed by both players and requires your final approval.`,
                status: "unread",
                actionStatus: "awaiting_confirmation", // use valid enum
              }, { transaction });
            }
          }
        }

        await transaction.commit();

        // Send email notification to submitter
        const submitter = await Player.findByPk(matchResult.submittedBy, {
          attributes: ["id", "name", "nickname"],
          include: [{ model: User, as: "user", attributes: ["email"] }],
        });

        const opponent = await Player.findByPk(signingPlayerId, {
          attributes: ["id", "name", "nickname"]
        });

        if (submitter && submitter.user && submitter.user.email) {
          let scoreSummary = '';
          if (String(matchResult.sport).toLowerCase() === 'snooker' || String(matchResult.sport).toLowerCase() === 'pooker') {
            scoreSummary = `${matchResult.player1Frames} - ${matchResult.player2Frames} (Frames)`;
          } else if (matchResult.sport === 'pool') {
            scoreSummary = `${matchResult.player1RackWins} - ${matchResult.player2RackWins} (Racks)`;
          } else {
            scoreSummary = 'Match Result Finalized';
          }

          sendMatchResultStatusUpdateEmail({
            playerEmail: submitter.user.email,
            playerName: submitter.name || submitter.nickname,
            opponentName: opponent.name || opponent.nickname,
            status: targetStatus,
            leagueName: matchResult.league?.name || "League Match",
            scoreSummary
          }).catch(err => console.error('[confirmMatchResult] Error sending email:', err));
        }

        // Update league standings in background if confirmed
        if (!requiresAdminApproval && matchResult.matchType === "league" && matchResult.leagueId) {
          standingsService.updateLeagueStandings(matchResult.leagueId).catch(err => {
            console.error(`[confirmMatchResult] Error updating standings for league ${matchResult.leagueId}:`, err);
          });

          // Special handling for Swiss round progression
          const { checkAndUpdateSwissPairings } = require('../services/fixtureGenerator');
          const fixture = await Fixture.findByPk(matchResult.fixtureId);
          if (matchResult.league?.format === 'swiss' || matchResult.league?.leagueType === 'swiss') {
            checkAndUpdateSwissPairings(matchResult.leagueId, fixture?.round || 1, fixture?.divisionId)
              .catch(err => console.error('[confirmMatchResult] Swiss update error:', err.message));
          }

          // Automatic knockout advancement for Straight Knockout leagues (when confirmed by opponent)
          const { advanceKnockoutWinner } = require('../services/fixtureGenerator');
          const isKnockout = (matchResult.league?.format === 'knockout' || matchResult.league?.format === 'double_elimination' || matchResult.league?.format === 'groupsKnockout');
          const isKnockoutStage = fixture?.stage === 'knockout' || fixture?.stage === 'groupsKnockout';
          if ((isKnockout || isKnockoutStage) && matchResult.winnerId && matchResult.fixtureId) {
            console.log(`[confirmMatchResult] Auto-advancing knockout winner for fixture ${matchResult.fixtureId}, isKnockoutStage: ${isKnockoutStage}`);
            advanceKnockoutWinner(matchResult.fixtureId, matchResult.winnerId).catch(err => {
              console.error(`[confirmMatchResult] Knockout advancement error:`, err.message);
            });
          }
        }

        const message = requiresAdminApproval
          ? "Match result confirmed by opponent. It is now awaiting final admin approval."
          : "Match result confirmed successfully. Booking marked as completed.";

        res.json({
          success: true,
          data: {
            id: matchResult.id,
            status: matchResult.resultStatus,
          },
          message,
        });
      } else {
        // Mark as disputed - Create entry in disputed_matches table
        // For tournaments, we always allow disputes (no per-league reporting config)
        const isLeague = matchResult.matchType === 'league';
        const disputeEnabled = isLeague
          ? matchResult.league?.reporting?.dispute?.enabled !== false
          : true;

        if (!disputeEnabled) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            error: "Disputes are not enabled for this league."
          });
        }

        // Prevent disputes on walkover results awaiting admin approval
        if (matchResult.isWalkover && matchResult.resultStatus === "Awaiting Admin Approval") {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            error: "Cannot dispute a walkover result that is awaiting admin approval. Please wait for admin to approve or reject the walkover."
          });
        }

        // Check Dispute Time Limit
        const timeLimitHours = parseInt(matchResult.league?.reporting?.dispute?.timeLimit) || 0;
        if (timeLimitHours > 0) {
          const submittedAt = new Date(matchResult.submittedAt);
          const now = new Date();
          const diffMs = now - submittedAt;
          const diffHours = diffMs / (1000 * 60 * 60);

          if (diffHours > timeLimitHours) {
            await transaction.rollback();
            return res.status(400).json({
              success: false,
              error: `Dispute period has expired. Matches must be disputed within ${timeLimitHours} hours of submission.`
            });
          }
        }

        const disputeReason = req.body.disputeReason || "Result disputed by opponent";
        const claimedScore = req.body.claimedScore || {};

        await matchResult.update(
          {
            resultStatus: "Disputed",
            disputeReason,
            confirmedBy: null,  // Reset confirmation when disputing
            confirmedAt: null,  // Reset confirmation timestamp
          },
          { transaction }
        );

        // If the result was previously confirmed and booking was marked completed, reset booking status to pending
        if (matchResult.booking && matchResult.booking.status === "completed") {
          await matchResult.booking.update(
            { status: "pending" },
            { transaction }
          );
        }

        // Helper function to safely parse JSON fields and normalize empty arrays to null
        const safeParseJSON = (data) => {
          if (!data) return null;
          if (typeof data === 'string') {
            try {
              const parsed = JSON.parse(data);
              // Convert empty arrays to null for consistency
              return Array.isArray(parsed) && parsed.length === 0 ? null : parsed;
            } catch (e) {
              console.error('Error parsing JSON data:', e);
              return null;
            }
          }
          // If it's an array, convert empty arrays to null
          if (Array.isArray(data)) {
            return data.length === 0 ? null : data;
          }
          return data;
        };

        // Check if dispute already exists for this match result
        const existingDispute = await DisputedMatch.findOne(
          {
            where: { matchResultId: matchResult.id },
            transaction,
          }
        );

        const disputeData = {
          matchResultId: matchResult.id,
          bookingId: matchResult.bookingId || null,
          fixtureId: matchResult.fixtureId,
          leagueId: matchResult.leagueId,
          tournamentId: matchResult.tournamentId,
          matchType: matchResult.matchType,
          sport: matchResult.sport,
          submitterId: matchResult.submittedBy,
          opponentId: signingPlayerId,
          originalWinnerId: matchResult.winnerId,
          player1Frames: matchResult.player1Frames,
          player2Frames: matchResult.player2Frames,
          snookerFrameDetails: safeParseJSON(matchResult.snookerFrameDetails),
          pookerFrameDetails: safeParseJSON(matchResult.pookerFrameDetails),
          player1RackWins: matchResult.player1RackWins,
          player2RackWins: matchResult.player2RackWins,
          poolRackDetails: safeParseJSON(matchResult.poolRackDetails),
          imageUrl: matchResult.imageUrl,
          highestBreak: matchResult.highestBreak,
          player1BallsPotted: matchResult.player1BallsPotted,
          player2BallsPotted: matchResult.player2BallsPotted,
          player1SevenBallWins: matchResult.player1SevenBallWins,
          player2SevenBallWins: matchResult.player2SevenBallWins,
          player1BlackFinishes: matchResult.player1BlackFinishes,
          player2BlackFinishes: matchResult.player2BlackFinishes,
          player1WhitewashWins: matchResult.player1WhitewashWins,
          player2WhitewashWins: matchResult.player2WhitewashWins,

          // Claimed score from the disputing opponent
          claimedWinnerId: claimedScore.winnerId || null,
          claimedPlayer1Frames: claimedScore.player1Frames !== undefined ? claimedScore.player1Frames : null,
          claimedPlayer2Frames: claimedScore.player2Frames !== undefined ? claimedScore.player2Frames : null,
          claimedSnookerFrameDetails: safeParseJSON(claimedScore.snookerFrameDetails),
          claimedPlayer1RackWins: claimedScore.player1RackWins !== undefined ? claimedScore.player1RackWins : null,
          claimedPlayer2RackWins: claimedScore.player2RackWins !== undefined ? claimedScore.player2RackWins : null,
          claimedPoolRackDetails: safeParseJSON(claimedScore.poolRackDetails),
          claimedPookerFrameDetails: safeParseJSON(claimedScore.pookerFrameDetails),
          claimedHighestBreak: claimedScore.highestBreak || 0,
          claimedPlayer1BallsPotted: claimedScore.player1BallsPotted || 0,
          claimedPlayer2BallsPotted: claimedScore.player2BallsPotted || 0,
          claimedPlayer1SevenBallWins: claimedScore.player1SevenBallWins || 0,
          claimedPlayer2SevenBallWins: claimedScore.player2SevenBallWins || 0,
          claimedPlayer1BlackFinishes: claimedScore.player1BlackFinishes || 0,
          claimedPlayer2BlackFinishes: claimedScore.player2BlackFinishes || 0,
          claimedPlayer1WhitewashWins: claimedScore.player1WhitewashWins || 0,
          claimedPlayer2WhitewashWins: claimedScore.player2WhitewashWins || 0,

          disputeReason,
          disputeStatus: "under_review",
          disputedAt: new Date(),
        };

        if (existingDispute) {
          // Update existing dispute with new claimed scores
          await existingDispute.update(disputeData, { transaction });
        } else {
          // Create new disputed match record
          await DisputedMatch.create(disputeData, { transaction });
        }

        // Update the notification status
        await Notification.update(
          {
            status: "actioned",
            actionStatus: "disputed",
          },
          {
            where: {
              relatedEntityType: "match_result",
              relatedEntityId: resultId,
              recipientId: opponentId,
            },
            transaction,
          }
        );

        await transaction.commit();

        // Send email notification to submitter
        const submitter = await Player.findByPk(matchResult.submittedBy, {
          attributes: ["id", "name", "nickname"],
          include: [{ model: User, as: "user", attributes: ["email"] }],
        });

        const opponent = await Player.findByPk(signingPlayerId, {
          attributes: ["id", "name", "nickname"]
        });

        if (submitter && submitter.user && submitter.user.email) {
          let scoreSummary = '';
          if (String(matchResult.sport).toLowerCase() === 'snooker' || String(matchResult.sport).toLowerCase() === 'pooker') {
            scoreSummary = `${matchResult.player1Frames} - ${matchResult.player2Frames} (Frames)`;
          } else if (matchResult.sport === 'pool') {
            scoreSummary = `${matchResult.player1RackWins} - ${matchResult.player2RackWins} (Racks)`;
          } else {
            scoreSummary = 'Match Result Disputed';
          }

          sendMatchResultStatusUpdateEmail({
            playerEmail: submitter.user.email,
            playerName: submitter.name || submitter.nickname,
            opponentName: opponent.name || opponent.nickname,
            status: "Disputed",
            leagueName: matchResult.league?.name || "League Match",
            scoreSummary
          }).catch(err => console.error('[confirmMatchResult] Error sending dispute email:', err));
        }

        res.json({
          success: true,
          message:
            "Match result disputed. The dispute has been forwarded to the organization admin for review.",
        });
      }
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      console.error("confirmMatchResult error:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  };

  // ============================================
  // HELPER: AUTO-CORRECT RESULT SCORES
  // ============================================
  /**
   * Historically, some results were saved with 0-0 summary scores due to a string comparison bug,
   * even though granular frame/rack details were provided.
   * This helper re-calculates the summary scores and winnerId from details when needed.
   */
  const autoCorrectResultScores = (result) => {
    if (!result) return result;

    // Normalize sport name for frontend compatibility
    if (result.sport && (String(result.sport).toLowerCase() === 'poker' || String(result.sport).toLowerCase() === 'pooker')) {
      result.sport = 'pooker';
    }

    // Determine the player1/player2 score values from recorded fields.
    let p1Score = 0;
    let p2Score = 0;
    if (String(result.sport).toLowerCase() === 'snooker' || String(result.sport).toLowerCase() === 'pooker') {
      p1Score = parseInt(result.player1Frames) || 0;
      p2Score = parseInt(result.player2Frames) || 0;
    } else if (result.sport === 'pool') {
      p1Score = parseInt(result.player1RackWins) || 0;
      p2Score = parseInt(result.player2RackWins) || 0;
    }

    // Fill in scores from detailed frame/rack data when summary scores are absent.
    const frameData = (String(result.sport).toLowerCase() === 'snooker' || String(result.sport).toLowerCase() === 'pooker') ?
      result.pookerFrameDetails || result.snookerFrameDetails :
      result.poolRackDetails;

    if ((p1Score === 0 && p2Score === 0) && frameData) {
      let frames = frameData;
      if (typeof frameData === 'string') {
        try { frames = JSON.parse(frameData); } catch (e) { frames = []; }
      }

      if (Array.isArray(frames) && frames.length > 0) {
        const p1Wins = frames.filter(f => (parseInt(f.player1Score) || 0) > (parseInt(f.player2Score) || 0)).length;
        const p2Wins = frames.filter(f => (parseInt(f.player2Score) || 0) > (parseInt(f.player1Score) || 0)).length;

        p1Score = p1Wins;
        p2Score = p2Wins;

        if (String(result.sport).toLowerCase() === 'snooker' || String(result.sport).toLowerCase() === 'pooker') {
          result.player1Frames = p1Wins;
          result.player2Frames = p2Wins;
        } else if (result.sport === 'pool') {
          result.player1RackWins = p1Wins;
          result.player2RackWins = p2Wins;
        }
      }
    }

    // If we have valid scores, set or correct winnerId according to score counts.
    if (p1Score > 0 || p2Score > 0) {
      const scoreWinnerId = p1Score > p2Score ? result.player1Id : p2Score > p1Score ? result.player2Id : null;
      if (scoreWinnerId) {
        result.winnerId = scoreWinnerId;
      }
    }

    return result;
  };

  // ============================================
  // GET PENDING RESULTS FOR PLAYER TO CONFIRM
  // ============================================
  exports.getPendingResults = async (req, res) => {
    try {
      const { userId } = req.user;

      // Get all player profile IDs (Unify by email for dual-role users)
      const playerIds = await getAllPlayerIdsForUser(userId);
      if (!playerIds || playerIds.length === 0) {
        return res.status(404).json({ success: false, error: "Player profile not found" });
      }

      console.log(`[getPendingResults] Fetching pending results for player profiles: ${playerIds.join(', ')}`);

      // ===== MULTI-PROFILE QUERY =====
      // Get results with status "Pending" that involve any of the current user's player profiles
      // but were NOT submitted by the current user.
      const pendingResults = await MatchResult.findAll({
        attributes: [
          'id', 'bookingId', 'fixtureId', 'leagueId', 'tournamentId', 'matchType', 'sport',
          'submittedBy', 'player1Id', 'player2Id', 'player1Frames', 'player2Frames',
          'snookerFrameDetails', 'pookerFrameDetails', 'player1RackWins', 'player2RackWins', 'poolRackDetails',
          'winnerId', 'resultStatus', 'submittedAt', 'confirmedBy', 'confirmedAt',
          'adminApprovedBy', 'adminApprovedAt', 'disputeReason', 'notes', 'imageUrl',
          'highestBreak', 'player1BallsPotted', 'player2BallsPotted', 'player1SevenBallWins', 'player2SevenBallWins',
          'player1BlackFinishes', 'player2BlackFinishes', 'player1WhitewashWins', 'player2WhitewashWins',
          'isWalkover', 'walkoverReason'
        ],
        where: {
          resultStatus: { [Op.in]: ["Pending", "Awaiting Admin Approval"] },
          submittedBy: { [Op.notIn]: playerIds }, // NOT submitted by me (I'm the opponent)
          isWalkover: false, // Exclude walkovers from opponent's pending confirmations
          [Op.or]: [
            { player1Id: { [Op.in]: playerIds } },
            { player2Id: { [Op.in]: playerIds } }
          ]
        },
        include: [
          {
            model: Player,
            as: "player1",
            attributes: ["id", "name", "nickname"],
            required: false,
          },
          {
            model: Player,
            as: "player2",
            attributes: ["id", "name", "nickname"],
            required: false,
          },
          {
            model: Player,
            as: "submitter",
            attributes: ["id", "name", "nickname"],
            required: false,
          },
          {
            model: Player,
            as: "winner",
            attributes: ["id", "name", "nickname"],
            required: false,
          },
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "sport", "reporting"],
            required: false,
          },
          {
            model: Tournament,
            as: "tournament",
            attributes: ["id", "name", "sport"],
            required: false,
          },
          {
            model: Booking,
            as: "booking",
            attributes: ["id", "bookingDate", "startTime", "tableNumber", "tableName", "leagueId", "sport", "playerId", "opponentId", "status"],
            required: false,
            include: [
              {
                model: League,
                as: "league",
                attributes: ["id", "name", "sport", "reporting"],
                required: false,
              },
              {
                model: Player,
                as: "player",
                attributes: ["id", "name", "nickname"],
                required: false,
              },
              {
                model: Player,
                as: "opponent",
                attributes: ["id", "name", "nickname"],
                required: false,
              },
            ],
          },
        ],
        order: [["submittedAt", "DESC"]],
      });

      console.log(`[getPendingResults] Found ${pendingResults.length} pending results`);

      // DEBUG: Log the first result with full reporting details
      if (pendingResults.length > 0) {
        const firstResult = pendingResults[0];
        console.log('[getPendingResults] First result reporting details:', {
          leagueReporting: firstResult.league?.reporting,
          bookingLeagueReporting: firstResult.booking?.league?.reporting,
          type: typeof firstResult.league?.reporting,
          bookingType: typeof firstResult.booking?.league?.reporting,
        });
      }

      // Auto-correct scores for historical data
      const correctedResults = pendingResults.map(r => {
        const plain = r.get({ plain: true });
        return autoCorrectResultScores(plain);
      });

      res.json({
        success: true,
        data: correctedResults,
        message: correctedResults.length === 0
          ? "No pending results found in database"
          : `Found ${correctedResults.length} pending result(s)`,
      });
    } catch (error) {
      res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
      console.error("[getPendingResults] Full error:", {
        message: error.message,
        stack: error.stack,
        sql: error.sql,
      });
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  // ============================================
  // GET PLAYER'S OWN SUBMITTED RESULTS
  // ============================================
  exports.getMySubmittedResults = async (req, res) => {
    try {
      const { userId } = req.user;

      // Get all player profile IDs (Unify by email for dual-role users)
      const playerIds = await getAllPlayerIdsForUser(userId);
      if (!playerIds || playerIds.length === 0) {
        res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
        return res.status(404).json({ success: false, error: "Player profile not found" });
      }

      console.log(`[getMySubmittedResults] Fetching submitted results for player profiles: ${playerIds.join(', ')}`);

      // Find all results submitted by any of these player profiles
      const submittedResults = await MatchResult.findAll({
        attributes: [
          'id', 'bookingId', 'fixtureId', 'leagueId', 'tournamentId', 'matchType', 'sport',
          'submittedBy', 'player1Id', 'player2Id', 'player1Frames', 'player2Frames',
          'snookerFrameDetails', 'pookerFrameDetails', 'player1RackWins', 'player2RackWins', 'poolRackDetails',
          'winnerId', 'resultStatus', 'submittedAt', 'confirmedBy', 'confirmedAt',
          'adminApprovedBy', 'adminApprovedAt', 'disputeReason', 'notes', 'imageUrl',
          'highestBreak', 'player1BallsPotted', 'player2BallsPotted', 'player1SevenBallWins', 'player2SevenBallWins',
          'player1BlackFinishes', 'player2BlackFinishes', 'player1WhitewashWins', 'player2WhitewashWins',
          'isWalkover', 'walkoverReason'
        ],
        where: {
          submittedBy: { [Op.in]: playerIds },
          resultStatus: { [Op.in]: ["Pending", "Awaiting Admin Approval", "Disputed"] },
        },
        include: [
          {
            model: Player,
            as: "player1",
            attributes: ["id", "name", "nickname"],
            required: false,
          },
          {
            model: Player,
            as: "player2",
            attributes: ["id", "name", "nickname"],
            required: false,
          },
          {
            model: Player,
            as: "submitter",
            attributes: ["id", "name", "nickname"],
            required: false,
          },
          {
            model: Player,
            as: "winner",
            attributes: ["id", "name", "nickname"],
            required: false,
          },
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "sport", "reporting"],
            required: false,
          },
          {
            model: Tournament,
            as: "tournament",
            attributes: ["id", "name", "sport"],
            required: false,
          },
          {
            model: Booking,
            as: "booking",
            attributes: ["id", "bookingDate", "startTime", "tableNumber", "tableName", "status", "leagueId", "sport", "playerId", "opponentId"],
            required: false,
            include: [
              {
                model: League,
                as: "league",
                attributes: ["id", "name", "sport", "reporting"],
                required: false,
              },
              {
                model: Player,
                as: "player",
                attributes: ["id", "name", "nickname"],
                required: false,
              },
              {
                model: Player,
                as: "opponent",
                attributes: ["id", "name", "nickname"],
                required: false,
              },
            ],
          },
        ],
        order: [["submittedAt", "DESC"]],
      });

      console.log(`[getMySubmittedResults] Found ${submittedResults.length} submitted results for player profiles: ${playerIds.join(', ')}`);

      // Auto-correct scores for historical data
      const correctedResults = submittedResults.map(r => {
        const plain = r.get({ plain: true });
        return autoCorrectResultScores(plain);
      });

      res.json({
        success: true,
        data: correctedResults,
        message: correctedResults.length === 0
          ? "No results submitted yet. Go to 'Upload Score' to submit a new match result."
          : "Your submitted results retrieved successfully",
      });
    } catch (error) {
      res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
      console.error("[getMySubmittedResults] Full error:", {
        message: error.message,
        stack: error.stack,
        sql: error.sql,
      });
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  // ============================================
  // DIAGNOSTIC: GET ALL PENDING DATA (FOR TESTING)
  // ============================================
  exports.getAllPendingResults = async (req, res) => {
    try {
      console.log("[getAllPendingResults] Fetching ALL pending results from database...");

      // Get count by status
      const stats = await MatchResult.count({
        attributes: ["resultStatus"],
        group: ["resultStatus"],
        raw: true
      });
      console.log("[DEBUG] Results by status:", stats);

      // Get ALL pending results without any filters
      const allPending = await MatchResult.findAll({
        where: { resultStatus: "Pending" },
        attributes: ["id", "bookingId", "player1Id", "player2Id", "submittedBy", "resultStatus", "sport", "matchType", "submittedAt"],
        raw: true,
        limit: 20
      });

      console.log(`[DEBUG] Total Pending results in database: ${allPending.length}`);
      console.log("[DEBUG] All Pending results (raw):", JSON.stringify(allPending, null, 2));

      // Get full pending results with relationships
      const pendingWithRelations = await MatchResult.findAll({
        where: { resultStatus: "Pending" },
        include: [
          {
            model: Player,
            as: "player1",
            attributes: ["id", "name"],
            required: false,
          },
          {
            model: Player,
            as: "player2",
            attributes: ["id", "name"],
            required: false,
          },
          {
            model: Player,
            as: "submitter",
            attributes: ["id", "name"],
            required: false,
          },
          {
            model: Booking,
            as: "booking",
            attributes: ["id", "leagueId", "sport"],
            required: false,
          },
        ],
        limit: 20
      });

      res.json({
        success: true,
        message: `Found ${pendingWithRelations.length} total pending results in database`,
        data: pendingWithRelations,
        debug: {
          totalPending: allPending.length,
          statusBreakdown: stats
        }
      });
    } catch (error) {
      console.error("[getAllPendingResults] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  };

  // ============================================
  // GET COMPLETED RESULTS FOR PLAYER
  // ============================================
  exports.getCompletedResults = async (req, res) => {
    try {
      const { userId } = req.user;

      // Get all player profile IDs (Unify by email for dual-role users)
      const playerIds = await getAllPlayerIdsForUser(userId);
      if (!playerIds || playerIds.length === 0) {
        res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
        return res.status(404).json({ success: false, error: "Player profile not found" });
      }

      console.log(`[getCompletedResults] Fetching completed results for player profiles: ${playerIds.join(', ')}`);

      // Get results with status "Confirmed" or "Disputed" where player actually played in the match
      const completedResults = await MatchResult.findAll({
        attributes: [
          'id', 'bookingId', 'fixtureId', 'leagueId', 'tournamentId', 'matchType', 'sport',
          'submittedBy', 'player1Id', 'player2Id', 'player1Frames', 'player2Frames',
          'snookerFrameDetails', 'pookerFrameDetails', 'player1RackWins', 'player2RackWins', 'poolRackDetails',
          'winnerId', 'resultStatus', 'submittedAt', 'confirmedBy', 'confirmedAt',
          'adminApprovedBy', 'adminApprovedAt', 'disputeReason', 'notes', 'imageUrl',
          'highestBreak', 'player1BallsPotted', 'player2BallsPotted', 'player1SevenBallWins', 'player2SevenBallWins',
          'player1BlackFinishes', 'player2BlackFinishes', 'player1WhitewashWins', 'player2WhitewashWins',
          'isWalkover', 'walkoverReason'
        ],
        where: {
          resultStatus: {
            [Op.in]: ["Confirmed", "Completed"]
          },
          isWalkover: false, // Exclude walkovers from opponent's history
          [Op.or]: [
            { player1Id: { [Op.in]: playerIds } },
            { player2Id: { [Op.in]: playerIds } }
          ]
        },
        include: [
          {
            model: Player,
            as: "player1",
            attributes: ["id", "name", "nickname"],
            required: false,
          },
          {
            model: Player,
            as: "player2",
            attributes: ["id", "name", "nickname"],
            required: false,
          },
          {
            model: Player,
            as: "submitter",
            attributes: ["id", "name", "nickname"],
            required: false,
          },
          {
            model: Player,
            as: "winner",
            attributes: ["id", "name", "nickname"],
            required: false,
          },
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "sport", "reporting"],
            required: false,
          },
          {
            model: Tournament,
            as: "tournament",
            attributes: ["id", "name", "sport"],
            required: false,
          },
          {
            model: Booking,
            as: "booking",
            attributes: ["id", "bookingDate", "startTime", "tableNumber", "tableName", "leagueId", "sport", "playerId", "opponentId", "status"],
            required: false,
            include: [
              {
                model: League,
                as: "league",
                attributes: ["id", "name", "sport", "reporting"],
                required: false,
              },
              {
                model: Player,
                as: "player",
                attributes: ["id", "name", "nickname"],
                required: false,
              },
              {
                model: Player,
                as: "opponent",
                attributes: ["id", "name", "nickname"],
                required: false,
              },
            ],
          },
        ],
        order: [[
          sequelize.fn(
            'COALESCE',
            sequelize.col('MatchResult.confirmedAt'),
            sequelize.col('MatchResult.adminApprovedAt'),
            sequelize.col('MatchResult.submittedAt')
          ),
          'DESC'
        ]],
      });

      console.log(`[getCompletedResults] Found ${completedResults.length} completed results`);
      // Auto-correct scores for historical data
      const correctedResults = completedResults.map(r => {
        const plain = r.get({ plain: true });
        return autoCorrectResultScores(plain);
      });

      res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
      res.json({
        success: true,
        data: correctedResults,
        message: correctedResults.length === 0
          ? "No completed results found"
          : "Completed match results retrieved successfully",
      });
    } catch (error) {
      res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
      console.error("[getCompletedResults] Full error:", {
        message: error.message,
        stack: error.stack,
        sql: error.sql,
      });
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  // ============================================
  // ORGANIZATION DISPUTE MANAGEMENT
  // ============================================

  // Get all disputes for an organization (all sports/leagues)
  exports.getOrganizationDisputes = async (req, res) => {
    try {
      const { userId } = req.user;

      // Find organization profile
      const organization = await Organization.findOne({ where: { userId } });
      if (!organization) {
        return res.status(404).json({ success: false, error: "Organization profile not found" });
      }

      // Get all disputes for this organization's leagues/tournaments
      const disputes = await DisputedMatch.findAll({
        where: {
          disputeStatus: "under_review",
        },
        attributes: [
          "id", "matchResultId", "bookingId", "fixtureId", "leagueId", "tournamentId",
          "matchType", "sport", "submitterId", "opponentId", "originalWinnerId",
          "player1Frames", "player2Frames", "snookerFrameDetails",
          "player1RackWins", "player2RackWins", "poolRackDetails",
          "imageUrl", "disputeReason", "disputeStatus",
          "disputedAt", "resolvedBy", "resolvedAt", "resolutionNotes",
          "finalWinnerId", "finalPlayer1Frames", "finalPlayer2Frames", "finalSnookerFrameDetails",
          "finalPookerFrameDetails",
          "finalPlayer1RackWins", "finalPlayer2RackWins", "finalPoolRackDetails",
          "pookerFrameDetails"
        ],
        include: [
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "sport", "organizationId"],
            required: false,
          },
          {
            model: Tournament,
            as: "tournament",
            attributes: ["id", "name", "sport", "organizationId"],
            required: false,
          },
          {
            model: Player,
            as: "submitter",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: Player,
            as: "opponent",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: MatchResult,
            as: "matchResult",
            attributes: ["id", "player1Id", "player2Id"],
          },
        ],
      });

      // Filter to only include disputes from this organization's leagues or tournaments
      const organizationDisputes = disputes.filter((dispute) => {
        const belongsToOrg = (dispute.league && dispute.league.organizationId === organization.id) ||
                             (dispute.tournament && dispute.tournament.organizationId === organization.id);
        return belongsToOrg;
      });

      // Also get pending walkovers for this organization
      const walkovers = await MatchResult.findAll({
        where: {
          resultStatus: 'Awaiting Admin Approval',
          isWalkover: true,
        },
        include: [
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "sport", "organizationId"],
            required: false,
          },
          {
            model: Player,
            as: "player1",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: Player,
            as: "player2",
            attributes: ["id", "name", "nickname"],
          },
        ],
      });

      // Filter walkovers to only include those from this organization
      const orgWalkovers = walkovers.filter(w => w.league && w.league.organizationId === organization.id);

      // Format walkovers as dispute-like objects
      const walkoverDisputes = orgWalkovers.map(w => ({
        id: `walkover-${w.id}`,
        matchResultId: w.id,
        bookingId: w.bookingId,
        fixtureId: w.fixtureId,
        leagueId: w.leagueId,
        matchType: w.matchType,
        sport: w.sport,
        submitterId: w.submittedBy,
        opponentId: w.player1Id === w.submittedBy ? w.player2Id : w.player1Id,
        originalWinnerId: w.winnerId,
        player1Frames: w.player1Frames,
        player2Frames: w.player2Frames,
        player1RackWins: w.player1RackWins,
        player2RackWins: w.player2RackWins,
        imageUrl: w.imageUrl,
        disputeReason: "Walkover submitted, awaiting admin approval",
        disputeStatus: "under_review",
        disputedAt: w.submittedAt,
        league: w.league,
        submitter: w.player1Id === w.submittedBy ? w.player1 : w.player2,
        opponent: w.player1Id === w.submittedBy ? w.player2 : w.player1,
        matchResult: w,
        isWalkover: true,
      }));

      res.json({
        success: true,
        data: [...organizationDisputes, ...walkoverDisputes],
        message: "Organization disputes and walkovers retrieved successfully",
      });
    } catch (error) {
      console.error("getOrganizationDisputes error:", error.message, error.stack);
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  };

  // Get disputes filtered by sport (game type)
  exports.getDisputesBySport = async (req, res) => {
    try {
      const { userId } = req.user;
      let { sport } = req.params;
      if (sport) {
        sport = sport.toLowerCase();
        if (sport === 'poker') sport = 'pooker';
      }
      // Find organization profile
      const organization = await Organization.findOne({ where: { userId } });
      if (!organization) {
        return res.status(404).json({ success: false, error: "Organization profile not found" });
      }

      // Validate sport parameter
      const validSports = ["snooker", "pooker", "pool"];
      if (!validSports.includes(sport)) {
        return res.status(400).json({ success: false, error: "Invalid sport. Must be snooker, pooker, or pool" });
      }

      // Get all league and tournament IDs for this organization
      const leagues = await League.findAll({ where: { organizationId: organization.id }, attributes: ['id'] });
      const tournaments = await Tournament.findAll({ where: { organizationId: organization.id }, attributes: ['id'] });

      const leagueIds = leagues.map(l => l.id);
      const tournamentIds = tournaments.map(t => t.id);

      // Get all disputes for this organization's leagues/tournaments filtered by sport
      const capitalizedSport = sport.charAt(0).toUpperCase() + sport.slice(1).toLowerCase();

      const disputes = await DisputedMatch.findAll({
        where: {
          [Op.and]: [
            {
              disputeStatus: "under_review",
            },
            {
              [Op.or]: [
                { sport: sport },
                { sport: "" },
                { sport: null },
                { '$league.sport$': sport },
                { '$league.sport$': capitalizedSport },
                { '$tournament.sport$': sport },
                { '$tournament.sport$': capitalizedSport }
              ]
            },
            {
              [Op.or]: [
                { leagueId: { [Op.in]: leagueIds } },
                { tournamentId: { [Op.in]: tournamentIds } }
              ]
            }
          ]
        },

        attributes: [
          "id", "matchResultId", "bookingId", "fixtureId", "leagueId", "tournamentId",
          "matchType", "sport", "submitterId", "opponentId", "originalWinnerId",
          "player1Frames", "player2Frames", "snookerFrameDetails",
          "player1RackWins", "player2RackWins", "poolRackDetails",
          "pookerFrameDetails",
          "imageUrl", "disputeReason", "disputeStatus",
          "disputedAt", "resolvedBy", "resolvedAt", "resolutionNotes",
          "finalWinnerId", "finalPlayer1Frames", "finalPlayer2Frames", "finalSnookerFrameDetails",
          "finalPookerFrameDetails",
          "finalPlayer1RackWins", "finalPlayer2RackWins", "finalPoolRackDetails"
        ],
        include: [
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "sport", "organizationId", "reporting"],
            required: false,
          },
          {
            model: Tournament,
            as: "tournament",
            attributes: ["id", "name", "sport", "organizationId"],
            required: false,
          },
          {
            model: Player,
            as: "submitter",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: Player,
            as: "opponent",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: MatchResult,
            as: "matchResult",
            attributes: ["id", "player1Id", "player2Id"],
          },
        ],
      });

      // Finalize sport field if missing
      const finalizedDisputes = disputes.map(d => {
        const dispute = d.get({ plain: true });
        if (!dispute.sport || dispute.sport === "") {
          dispute.sport = dispute.league?.sport || dispute.tournament?.sport || sport;
        }
        return dispute;
      });

      res.json({
        success: true,
        data: finalizedDisputes,
        message: `Found ${finalizedDisputes.length} disputed ${sport} match(es)`,
      });
    } catch (error) {
      console.error("getDisputesBySport error:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  };

  // Get leagues that contain disputes (for snooker league filter)
  exports.getLeaguesWithDisputes = async (req, res) => {
    try {
      const { userId } = req.user;
      let { sport } = req.params;
      if (sport) {
        sport = sport.toLowerCase();
        if (sport === 'poker') sport = 'pooker';
      }

      // Find organization profile
      const organization = await Organization.findOne({ where: { userId } });
      if (!organization) {
        return res.status(404).json({ success: false, error: "Organization profile not found" });
      }

      // Handle capitalization for League model which uses a setter (Snooker, Pool, Pooker)
      const capitalizedSport = sport.charAt(0).toUpperCase() + sport.slice(1).toLowerCase();

      // Get all leagues with active disputes
      const leaguesWithDisputes = await League.findAll({
        where: {
          organizationId: organization.id,
          [Op.or]: [
            { sport: sport },
            { sport: capitalizedSport }
          ],
        },
        include: [
          {
            model: DisputedMatch,
            as: "disputes",
            where: {
              disputeStatus: "under_review",
              matchType: "league",
            },
            attributes: ["id"],
            required: true, // Only leagues with disputes
          },
          {
            model: Season,
            as: "season",
            attributes: ["id", "name"],
          },
        ],
        attributes: ["id", "name", "sport", "format"],
      });

      res.json({
        success: true,
        data: leaguesWithDisputes,
        count: leaguesWithDisputes.length,
        message: `Found ${leaguesWithDisputes.length} league(s) with disputes`,
      });
    } catch (error) {
      console.error("getLeaguesWithDisputes error:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  };

  // Get all unique game types (sports) used in an organization's leagues and tournaments
  exports.getOrganizationGameTypes = async (req, res) => {
    try {
      const { userId } = req.user;

      // Find organization profile
      const organization = await Organization.findOne({ where: { userId } });
      if (!organization) {
        return res.status(404).json({ success: false, error: "Organization profile not found" });
      }

      // Get unique sports from leagues
      const leagueSports = await League.findAll({
        where: { organizationId: organization.id },
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('sport')), 'sport']],
        raw: true
      });

      // Get unique sports from tournaments
      const tournamentSports = await Tournament.findAll({
        where: { organizationId: organization.id },
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('sport')), 'sport']],
        raw: true
      });

      // Combine and get unique set
      const sportsSet = new Set();
      leagueSports.forEach(item => { if (item.sport) sportsSet.add(item.sport); });
      tournamentSports.forEach(item => { if (item.sport) sportsSet.add(item.sport); });

      const uniqueSports = Array.from(sportsSet);

      // Sort to keep a consistent order
      const priority = ['Snooker', 'Pool', 'Pooker'];
      uniqueSports.sort((a, b) => {
        const idxA = priority.indexOf(a);
        const idxB = priority.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
      });

      res.json({ success: true, data: uniqueSports });
    } catch (error) {
      console.error("getOrganizationGameTypes error:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  };

  // Get all disputed matches for a specific league
  exports.getDisputesByLeague = async (req, res) => {
    try {
      const { userId } = req.user;
      const { leagueId } = req.params;

      // Find organization profile
      const organization = await Organization.findOne({ where: { userId } });
      if (!organization) {
        return res.status(404).json({ success: false, error: "Organization profile not found" });
      }

      // Verify league belongs to organization
      const league = await League.findOne({
        where: { id: leagueId, organizationId: organization.id },
      });

      if (!league) {
        return res.status(404).json({ success: false, error: "League not found or access denied" });
      }

      // Get all disputes for this league
      const disputes = await DisputedMatch.findAll({
        where: {
          leagueId,
          disputeStatus: "under_review",
        },
        include: [
          {
            model: Player,
            as: "submitter",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: Player,
            as: "opponent",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "sport"],
          },
          {
            model: Booking,
            as: "booking",
            attributes: ["id", "bookingDate", "startTime", "tableNumber", "tableName"],
          },
        ],
        order: [["disputedAt", "DESC"]],
      });

      res.json({
        success: true,
        data: disputes,
        count: disputes.length,
        message: `Found ${disputes.length} disputed match(es) for this league`,
      });
    } catch (error) {
      console.error("getDisputesByLeague error:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  };

  // Get full details of a specific dispute for review
  exports.getDisputeDetails = async (req, res) => {
    try {
      const { userId } = req.user;
      const { disputeId } = req.params;

      // Find organization profile
      const organization = await Organization.findOne({ where: { userId } });
      if (!organization) {
        return res.status(404).json({ success: false, error: "Organization profile not found" });
      }

      // Get dispute with full details
      const dispute = await DisputedMatch.findByPk(disputeId, {
        include: [
          {
            model: Player,
            as: "submitter",
            attributes: ["id", "name", "nickname"],
            include: [
              {
                model: User,
                as: "user",
                attributes: ["email"],
              },
            ],
          },
          {
            model: Player,
            as: "opponent",
            attributes: ["id", "name", "nickname"],
            include: [
              {
                model: User,
                as: "user",
                attributes: ["email"],
              },
            ],
          },
          {
            model: Player,
            as: "originalWinner",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "sport", "format", "organizationId"],
          },
          {
            model: Tournament,
            as: "tournament",
            attributes: ["id", "name", "sport", "organizationId"],
          },
          {
            model: Booking,
            as: "booking",
            attributes: ["id", "bookingDate", "startTime", "tableNumber", "tableName"],
          },
          {
            model: MatchResult,
            as: "matchResult",
            attributes: [
              "id",
              "notes",
              "submittedAt",
              "sport",
              "player1Id",
              "player2Id",
              "player1Frames",
              "player2Frames",
              "snookerFrameDetails",
              "pookerFrameDetails",
              "poolRackDetails",
            ],
            include: [
              {
                model: Player,
                as: "player1",
                attributes: ["id", "name", "nickname"],
              },
              {
                model: Player,
                as: "player2",
                attributes: ["id", "name", "nickname"],
              },
            ],
          },
        ],
      });

      if (!dispute) {
        return res.status(404).json({ success: false, error: "Dispute not found" });
      }

      // Verify dispute belongs to organization's league or tournament
      const isOrganizationDispute =
        (dispute.league && dispute.league.organizationId === organization.id) ||
        (dispute.tournament && dispute.tournament.organizationId === organization.id);

      if (!isOrganizationDispute) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      res.json({
        success: true,
        data: dispute,
        message: "Dispute details retrieved successfully",
      });
    } catch (error) {
      console.error("getDisputeDetails error:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  };

  /**
   * GET /api/match-results/disputes/game/:gameId
   * Resolves a game ID into a sport and returns all disputes for that sport.
   */
  exports.getDisputesByGame = async (req, res) => {
    try {
      const { userId } = req.user;
      const { gameId } = req.params;

      const organization = await Organization.findOne({ where: { userId } });
      if (!organization) {
        return res.status(404).json({ success: false, error: "Organization not found" });
      }

      const game = await Game.findByPk(gameId);
      if (!game) {
        return res.status(404).json({ success: false, error: "Game not found" });
      }

      let sport = game.name.toLowerCase();
      if (sport === 'poker') sport = 'pooker';
      const capitalizedSport = sport.charAt(0).toUpperCase() + sport.slice(1).toLowerCase();

      const [leagues, tournaments] = await Promise.all([
        League.findAll({ where: { organizationId: organization.id }, attributes: ['id'] }),
        Tournament.findAll({ where: { organizationId: organization.id }, attributes: ['id'] })
      ]);

      const leagueIds = leagues.map(l => l.id);
      const tournamentIds = tournaments.map(t => t.id);

      const disputes = await DisputedMatch.findAll({
        where: {
          disputeStatus: "under_review",
          sport: sport,
          [Op.or]: [
            { leagueId: { [Op.in]: leagueIds } },
            { tournamentId: { [Op.in]: tournamentIds } }
          ]
        },
        include: [
          { model: League, as: "league", attributes: ["id", "name", "sport"], required: false },
          { model: Tournament, as: "tournament", attributes: ["id", "name", "sport"], required: false },
          { model: Player, as: "submitter", attributes: ["id", "name", "nickname"], required: false },
          { model: Player, as: "opponent", attributes: ["id", "name", "nickname"], required: false },
          { model: MatchResult, as: "matchResult", required: false }
        ]
      });

      res.json({ success: true, data: disputes });
    } catch (error) {
      console.error("getDisputesByGame FULL ERROR:", error);
      res.status(500).json({ success: false, error: "Internal server error", details: error.message });
    }
  };

  // Resolve dispute (admin updates scores and confirms)
  exports.resolveDispute = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { userId } = req.user;
      const { disputeId } = req.params;
      let {
        finalWinnerId,
        finalPlayer1Frames,
        finalPlayer2Frames,
        finalSnookerFrameDetails,
        finalPlayer1RackWins,
        finalPlayer2RackWins,
        finalPoolRackDetails,
        finalHighestBreak,
        finalPlayer1BallsPotted,
        finalPlayer2BallsPotted,
        finalPlayer1SevenBallWins,
        finalPlayer2SevenBallWins,
        finalPlayer1BlackFinishes,
        finalPlayer2BlackFinishes,
        finalPlayer1WhitewashWins,
        finalPlayer2WhitewashWins,
        resolutionNotes,
        finalPookerFrameDetails,
      } = req.body;

      // Helper function to normalize JSON fields (convert empty arrays to null)
      const normalizeJSON = (data) => {
        if (!data) return null;
        if (typeof data === 'string') {
          try {
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) && parsed.length === 0 ? null : parsed;
          } catch (e) {
            console.error('Error parsing JSON data:', e);
            return null;
          }
        }
        if (Array.isArray(data)) {
          return data.length === 0 ? null : data;
        }
        return data;
      };

      // Convert empty strings to null for foreign key fields
      finalWinnerId = finalWinnerId ? finalWinnerId : null;

      // Normalize all frame detail fields
      finalSnookerFrameDetails = normalizeJSON(finalSnookerFrameDetails);
      finalPookerFrameDetails = normalizeJSON(finalPookerFrameDetails);
      finalPoolRackDetails = normalizeJSON(finalPoolRackDetails);

      console.log('[resolveDispute] Incoming request body:', JSON.stringify({
        finalWinnerId,
        finalPlayer1Frames,
        finalPlayer2Frames,
        finalPlayer1RackWins,
        finalPlayer2RackWins,
        sport: req.body.sport,
        hasFrameDetails: !!finalPookerFrameDetails
      }));

      // Find organization profile
      const organization = await Organization.findOne({ where: { userId }, transaction });
      if (!organization) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Organization profile not found" });
      }

      // Get dispute with related data
      const dispute = await DisputedMatch.findByPk(disputeId, {
        include: [
          {
            model: League,
            as: "league",
          },
          {
            model: Tournament,
            as: "tournament",
          },
          {
            model: MatchResult,
            as: "matchResult",
            include: [
              {
                model: Booking,
                as: "booking",
              },
            ],
          },
        ],
        transaction,
      });

      if (!dispute) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Dispute not found" });
      }

      // Verify dispute belongs to organization
      const isOrganizationDispute =
        (dispute.league && dispute.league.organizationId === organization.id) ||
        (dispute.tournament && dispute.tournament.organizationId === organization.id);

      if (!isOrganizationDispute) {
        await transaction.rollback();
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      const { sport } = dispute;
      console.log('[resolveDispute] Sport from dispute:', sport);
      const isPooker = sport === "pooker";
      const isSnooker = sport === "snooker";
      const isPool = sport === "pool";

      // DEFENSIVE: Recalculate totals from details if they are provided but totals are null/zero
      // PRIORITY: Use explicitly provided frame/rack totals if they differ from calculated
      // For Poker (pooker): prefer rackWins over frames for scoring
      let calcPlayer1Total, calcPlayer2Total;

      if (isPooker) {
        // For Poker, prefer rackWins (the actual score display field)
        calcPlayer1Total = finalPlayer1RackWins !== undefined ? finalPlayer1RackWins : (finalPlayer1Frames !== undefined ? finalPlayer1Frames : 0);
        calcPlayer2Total = finalPlayer2RackWins !== undefined ? finalPlayer2RackWins : (finalPlayer2Frames !== undefined ? finalPlayer2Frames : 0);
      } else if (isPool) {
        // For Pool, use rackWins
        calcPlayer1Total = finalPlayer1RackWins !== undefined ? finalPlayer1RackWins : 0;
        calcPlayer2Total = finalPlayer2RackWins !== undefined ? finalPlayer2RackWins : 0;
      } else {
        // For Snooker, use frames
        calcPlayer1Total = finalPlayer1Frames !== undefined ? finalPlayer1Frames : 0;
        calcPlayer2Total = finalPlayer2Frames !== undefined ? finalPlayer2Frames : 0;
      }

      // Check if explicit totals were provided (including zero values)
      const explicitTotalsProvided = (isPooker && finalPlayer1RackWins !== undefined) ||
        (isPool && finalPlayer1RackWins !== undefined) ||
        (isSnooker && finalPlayer1Frames !== undefined);

      console.log('[resolveDispute] Checking explicit totals:', {
        isPooker, isPool, isSnooker,
        finalPlayer1RackWins, finalPlayer1Frames,
        explicitTotalsProvided
      });

      // Only recalculate from details if no explicit totals were provided
      if (!explicitTotalsProvided) {
        const details = isSnooker ? finalSnookerFrameDetails : isPooker ? finalPookerFrameDetails : isPool ? finalPoolRackDetails : null;
        if (Array.isArray(details) && details.length > 0) {
          let p1Count = 0;
          let p2Count = 0;
          const p1Id = dispute.matchResult?.player1Id;
          const p2Id = dispute.matchResult?.player2Id;

          details.forEach(f => {
            const s1 = parseInt(f.player1Score) || 0;
            const s2 = parseInt(f.player2Score) || 0;
            if (f.winnerId === p1Id || s1 > s2) p1Count++;
            else if (f.winnerId === p2Id || s2 > s1) p2Count++;
          });

          // Override with calculated counts if they differ (prevents blank/0-0 results)
          calcPlayer1Total = p1Count;
          calcPlayer2Total = p2Count;
          console.log('[resolveDispute] Recalculated from frame details:', { p1Count, p2Count });
        }
      } else {
        console.log('[resolveDispute] Using explicit totals from admin:', { calcPlayer1Total, calcPlayer2Total, isPooker });
      }

      // Update dispute with final decision
      await dispute.update(
        {
          disputeStatus: "resolved",
          resolvedBy: organization.id,
          resolvedAt: new Date(),
          resolutionNotes,
          finalWinnerId,
          finalPlayer1Frames: (isSnooker || isPooker) ? calcPlayer1Total : undefined,
          finalPlayer2Frames: (isSnooker || isPooker) ? calcPlayer2Total : undefined,
          finalSnookerFrameDetails: isSnooker ? finalSnookerFrameDetails : null,
          finalPookerFrameDetails: isPooker ? finalPookerFrameDetails : null,
          // For Poker: also save rackWins (display field)
          finalPlayer1RackWins: (isPool || isPooker) ? calcPlayer1Total : undefined,
          finalPlayer2RackWins: (isPool || isPooker) ? calcPlayer2Total : undefined,
          finalPoolRackDetails,
          finalHighestBreak,
          finalPlayer1BallsPotted,
          finalPlayer2BallsPotted,
          finalPlayer1SevenBallWins,
          finalPlayer2SevenBallWins,
          finalPlayer1BlackFinishes,
          finalPlayer2BlackFinishes,
          finalPlayer1WhitewashWins,
          finalPlayer2WhitewashWins,
        },
        { transaction }
      );

      // Update the original match result with final data
      const matchResult = dispute.matchResult;

      // For Poker (pooker), update both frame fields AND rack wins fields since standings uses rackWins
      const updateFields = {
        resultStatus: "Confirmed",
        confirmedAt: new Date(),
        winnerId: finalWinnerId,
        player1Frames: (isSnooker || isPooker) ? calcPlayer1Total : undefined,
        player2Frames: (isSnooker || isPooker) ? calcPlayer2Total : undefined,
        player1RackWins: (isPool || isPooker) ? calcPlayer1Total : undefined,
        player2RackWins: (isPool || isPooker) ? calcPlayer2Total : undefined,
        snookerFrameDetails: isSnooker ? finalSnookerFrameDetails : undefined,
        pookerFrameDetails: isPooker ? finalPookerFrameDetails : undefined,
        poolRackDetails: isPool ? finalPoolRackDetails : undefined,
        highestBreak: finalHighestBreak !== undefined ? finalHighestBreak : matchResult.highestBreak,
        player1BallsPotted: finalPlayer1BallsPotted !== undefined ? finalPlayer1BallsPotted : matchResult.player1BallsPotted,
        player2BallsPotted: finalPlayer2BallsPotted !== undefined ? finalPlayer2BallsPotted : matchResult.player2BallsPotted,
        player1SevenBallWins: (isPool && finalPlayer1SevenBallWins !== undefined) ? finalPlayer1SevenBallWins : matchResult.player1SevenBallWins,
        player2SevenBallWins: (isPool && finalPlayer2SevenBallWins !== undefined) ? finalPlayer2SevenBallWins : matchResult.player2SevenBallWins,
        player1BlackFinishes: (isPooker && finalPlayer1BlackFinishes !== undefined) ? finalPlayer1BlackFinishes : matchResult.player1BlackFinishes,
        player2BlackFinishes: (isPooker && finalPlayer2BlackFinishes !== undefined) ? finalPlayer2BlackFinishes : matchResult.player2BlackFinishes,
        player1WhitewashWins: (isPooker && finalPlayer1WhitewashWins !== undefined) ? finalPlayer1WhitewashWins : matchResult.player1WhitewashWins,
        player2WhitewashWins: (isPooker && finalPlayer2WhitewashWins !== undefined) ? finalPlayer2WhitewashWins : matchResult.player2WhitewashWins,
        notes: matchResult.notes
          ? `${matchResult.notes}\n\nDispute resolved by admin: ${resolutionNotes}`
          : `Dispute resolved by admin: ${resolutionNotes}`,
      };

      await matchResult.update(updateFields, { transaction });

      // Update booking status to completed
      await matchResult.booking.update(
        {
          status: "completed",
        },
        { transaction }
      );

      // Update fixture if exists
      if (dispute.fixtureId) {
        const fixture = await Fixture.findByPk(dispute.fixtureId, { transaction });
        if (fixture) {
          const updateData = {
            status: "completed",
            winnerId: finalWinnerId,
            loserId:
              finalWinnerId === matchResult.player1Id
                ? matchResult.player2Id
                : matchResult.player1Id,
          };

          if (dispute.sport === "snooker") {
            updateData.player1Frames = calcPlayer1Total;
            updateData.player2Frames = calcPlayer2Total;
            updateData.resultData = finalSnookerFrameDetails;
            console.log('[resolveDispute] Snooker fixture update:', { player1Frames: calcPlayer1Total, player2Frames: calcPlayer2Total });
          } else if (dispute.sport === "pooker") {
            // For Pooker, update both frame fields and rack wins fields for proper display
            updateData.player1Frames = calcPlayer1Total;
            updateData.player2Frames = calcPlayer2Total;
            updateData.player1RackWins = calcPlayer1Total;
            updateData.player2RackWins = calcPlayer2Total;
            updateData.resultData = finalPookerFrameDetails;
            console.log('[resolveDispute] Pooker fixture update:', { player1Frames: calcPlayer1Total, player2Frames: calcPlayer2Total, player1RackWins: calcPlayer1Total, player2RackWins: calcPlayer2Total });
          } else if (dispute.sport === "pool") {
            updateData.player1RackWins = calcPlayer1Total;
            updateData.player2RackWins = calcPlayer2Total;
            updateData.resultData = finalPoolRackDetails;
            console.log('[resolveDispute] Pool fixture update:', { player1RackWins: calcPlayer1Total, player2RackWins: calcPlayer2Total });
          }

          console.log('[resolveDispute] Final fixture updateData:', updateData);
          await fixture.update(updateData, { transaction });
          console.log('[resolveDispute] Fixture updated successfully');
        }
      }

      // Update TournamentMatch if this is a tournament match
      if (matchResult.matchType === "tournament" && matchResult.tournamentId) {
        let tm = null;
        const bookingTmId = matchResult.booking?.tournamentMatchId;
        if (bookingTmId) {
          tm = await TournamentMatch.findByPk(bookingTmId, { transaction });
        }
        if (!tm) {
          tm = await TournamentMatch.findOne({
            where: {
              tournamentId: matchResult.tournamentId,
              player1Id: matchResult.player1Id,
              player2Id: matchResult.player2Id,
            },
            transaction,
          });
        }

        if (tm) {
          console.log('[resolveDispute] Updating TournamentMatch to completed:', { tmId: tm.id, winner: finalWinnerId });
          const now = new Date();

          // Determine winner for tournament match with comprehensive fallback chain
          let tmWinner = null;
          console.log('[resolveDispute] Starting winner determination:', {
            finalWinnerId,
            player1Id: matchResult.player1Id,
            player2Id: matchResult.player2Id,
            calcPlayer1Total,
            calcPlayer2Total,
            submitterId: dispute.submitterId,
            opponentId: dispute.opponentId
          });

          // Method 1: Check if finalWinnerId matches player IDs directly
          if (finalWinnerId === matchResult.player1Id) {
            tmWinner = "player1";
            console.log('[resolveDispute] Winner determined by direct player1Id match');
          } else if (finalWinnerId === matchResult.player2Id) {
            tmWinner = "player2";
            console.log('[resolveDispute] Winner determined by direct player2Id match');
          }
          // Method 2: If finalWinnerId doesn't match, try to map it
          else if (finalWinnerId === dispute.submitterId) {
            tmWinner = (dispute.matchResult?.player1Id === dispute.submitterId) ? "player1" : "player2";
            console.log('[resolveDispute] Winner determined by submitter mapping:', { tmWinner });
          } else if (finalWinnerId === dispute.opponentId) {
            tmWinner = (dispute.matchResult?.player1Id === dispute.opponentId) ? "player1" : "player2";
            console.log('[resolveDispute] Winner determined by opponent mapping:', { tmWinner });
          }

          // Method 3: If still no winner, determine from scores (MOST RELIABLE)
          if (!tmWinner) {
            console.log('[resolveDispute] No direct match found, determining winner by scores:', { calcPlayer1Total, calcPlayer2Total });
            if (calcPlayer1Total > calcPlayer2Total) {
              tmWinner = "player1";
              console.log('[resolveDispute] Winner determined by score: player1 wins', { calcPlayer1Total, calcPlayer2Total });
            } else if (calcPlayer2Total > calcPlayer1Total) {
              tmWinner = "player2";
              console.log('[resolveDispute] Winner determined by score: player2 wins', { calcPlayer1Total, calcPlayer2Total });
            } else if (calcPlayer1Total > 0 && calcPlayer2Total > 0) {
              // Both players scored same but > 0 = draw
              tmWinner = "draw";
              console.log('[resolveDispute] Winner determined by score: draw match');
            } else {
              // This shouldn't happen but set a default
              console.warn('[resolveDispute] ⚠️ Could not determine winner! Defaulting to player1. Scores:', { calcPlayer1Total, calcPlayer2Total });
              tmWinner = "player1";
            }
          }

          if (!tmWinner) {
            console.error('[resolveDispute] ❌ CRITICAL: Winner is still null after all determination methods!', {
              finalWinnerId,
              calcPlayer1Total,
              calcPlayer2Total,
              submitterId: dispute.submitterId,
              opponentId: dispute.opponentId
            });
          }

          console.log('[resolveDispute] Final tournament match winner:', { tmWinner, finalWinnerId, p1Score: calcPlayer1Total, p2Score: calcPlayer2Total });

          const tmUpdateData = {
            status: "completed",
            player1Confirmed: true,
            player2Confirmed: true,
            player1ConfirmedDate: tm.player1ConfirmedDate || now,
            player2ConfirmedDate: tm.player2ConfirmedDate || now,
            winner: tmWinner,
          };

          if (sport === "snooker" || sport === "pooker" || sport === "pool") {
            tmUpdateData.player1FramesWon = calcPlayer1Total;
            tmUpdateData.player2FramesWon = calcPlayer2Total;
          }

          const frameDetails = finalSnookerFrameDetails || finalPookerFrameDetails || finalPoolRackDetails;
          if (frameDetails) {
            tmUpdateData.player1FrameDetails = frameDetails;
            tmUpdateData.player2FrameDetails = frameDetails;
          }

          await tm.update(tmUpdateData, { transaction });
          console.log('[resolveDispute] TournamentMatch updated successfully:', tmUpdateData);

          // IMMEDIATELY update tournament player statistics and check for advancement
          // This must happen within the same transaction to ensure data consistency
          const tournament = await Tournament.findByPk(matchResult.tournamentId, { transaction });
          if (tournament) {
            console.log('[resolveDispute] Updating player statistics within transaction');
            const refreshedTm = await TournamentMatch.findByPk(tm.id, { transaction });
            await tournamentController._updatePlayerStatisticsAfterMatch(refreshedTm, tournament, transaction);
            await tournamentController._checkAndProgressRound(matchResult.tournamentId, tm.roundNumber, transaction);
            console.log('[resolveDispute] Tournament advancement checked within transaction');
          }
        } else {
          console.warn('[resolveDispute] TournamentMatch not found for:', {
            tournamentId: matchResult.tournamentId,
            player1Id: matchResult.player1Id,
            player2Id: matchResult.player2Id,
          });
        }
      }

      // Create notifications for both players
      await Notification.create(
        {
          recipientId: dispute.submitterId,
          type: "dispute_resolved",
          relatedEntityType: "disputed_match",
          relatedEntityId: dispute.id,
          title: "Dispute Resolved",
          message: `The dispute for your match has been resolved by the organization admin. ${resolutionNotes}`,
          status: "unread",
          actionStatus: "resolved",
          metadata: {
            disputeId: dispute.id,
            finalWinnerId,
            resolutionNotes,
          },
        },
        { transaction }
      );

      await Notification.create(
        {
          recipientId: dispute.opponentId,
          type: "dispute_resolved",
          relatedEntityType: "disputed_match",
          relatedEntityId: dispute.id,
          title: "Dispute Resolved",
          message: `The dispute you raised has been resolved by the organization admin. ${resolutionNotes}`,
          status: "unread",
          actionStatus: "resolved",
          metadata: {
            disputeId: dispute.id,
            finalWinnerId,
            resolutionNotes,
          },
        },
        { transaction }
      );

      // TODO: Update league standings, tournament brackets, player statistics
      // This should be implemented based on your specific business logic

      await transaction.commit();

      // Update league standings AFTER transaction commit so database has updated admin corrected values
      if (matchResult.matchType === "league" && matchResult.leagueId) {
        await standingsService.updateLeagueStandings(matchResult.leagueId);
      }

      // Clear league cache so fixtures are refreshed with new data
      if (dispute.matchResult.matchType === "league" && dispute.matchResult.leagueId) {
        const { clearLeagueCache } = require('./leagueController');
        try {
          await clearLeagueCache(dispute.matchResult.leagueId);
          console.log('[resolveDispute] League cache cleared for:', dispute.matchResult.leagueId);
        } catch (cacheErr) {
          console.error('[resolveDispute] Cache clear error:', cacheErr.message);
        }
      }

      // Run advancement logic after transaction completes
      if (matchResult.matchType === "league" && matchResult.leagueId) {
        setTimeout(async () => {
          try {
            const { advanceKnockoutWinner, checkAndUpdateSwissPairings, checkLeagueCompletion } = require('../services/fixtureGenerator');

            if (matchResult.fixtureId) {
              const fixture = await Fixture.findByPk(matchResult.fixtureId);
              if (fixture) {
                // 1. Advance Knockout
                if (fixture.stage === 'knockout' || fixture.stage === 'groupsKnockout') {
                  await advanceKnockoutWinner(fixture.id, matchResult.winnerId).catch(err => console.error('[resolveDispute] KO advance error:', err.message));
                }
                // 2. Update Swiss
                if (fixture.stage === 'swiss') {
                  await checkAndUpdateSwissPairings(matchResult.leagueId, fixture.round, fixture.divisionId).catch(err => console.error('[resolveDispute] Swiss update error:', err.message));
                }
              }
            }
            // 3. Final completion check (covers Round Robin and all others)
            await checkLeagueCompletion(matchResult.leagueId);
          } catch (advError) {
            console.error(`[resolveDispute] Match advancement/completion error:`, advError.message);
          }
        }, 0);
      }

      // Update tournament standings AFTER transaction commit so it sees the 'Confirmed' status
      if (matchResult.matchType === "tournament" && matchResult.tournamentId) {
        setTimeout(async () => {
          try {
            console.log('[resolveDispute] Verifying next round generation and logging final state');
            const tournament = await Tournament.findByPk(matchResult.tournamentId);
            if (tournament) {
              // Refresh tournament data to verify the state
              const format = await TournamentFormat.findOne({ where: { tournamentId: matchResult.tournamentId } });
              if (format && (format.type === 'knockout' || format.type === 'groups_knockout')) {
                let tm = null;
                const bookingTmId = matchResult.booking?.tournamentMatchId;
                if (bookingTmId) {
                  tm = await TournamentMatch.findByPk(bookingTmId);
                }
                if (!tm) {
                  tm = await TournamentMatch.findOne({
                    where: {
                      tournamentId: matchResult.tournamentId,
                      player1Id: matchResult.player1Id,
                      player2Id: matchResult.player2Id,
                    },
                  });
                }

                if (tm) {
                  const completedMatches = await TournamentMatch.count({
                    where: {
                      roundNumber: tm.roundNumber,
                      tournamentId: matchResult.tournamentId,
                      status: 'completed',
                      player2Id: { [Op.ne]: null }
                    }
                  });

                  const totalMatches = await TournamentMatch.count({
                    where: {
                      roundNumber: tm.roundNumber,
                      tournamentId: matchResult.tournamentId,
                      player2Id: { [Op.ne]: null }
                    }
                  });

                  console.log('[resolveDispute] Final knockout state verification:', {
                    roundNumber: tm.roundNumber,
                    completed: completedMatches,
                    total: totalMatches,
                    roundComplete: completedMatches === totalMatches && totalMatches > 0
                  });

                  if (completedMatches === totalMatches && totalMatches > 0) {
                    const nextRound = await TournamentRound.findOne({
                      where: {
                        tournamentId: matchResult.tournamentId,
                        roundNumber: tm.roundNumber + 1
                      }
                    });

                    console.log('[resolveDispute] Next round status:', {
                      nextRoundExists: !!nextRound,
                      nextRoundNumber: tm.roundNumber + 1
                    });
                  }
                }
              }
            }
          } catch (err) {
            console.error('[resolveDispute] Error in verification:', err.message);
          }
        }, 100);
      }

      res.json({
        success: true,
        message: "Dispute resolved successfully. Match result and standings updated.",
        data: {
          disputeId: dispute.id,
          matchResultId: matchResult.id,
          finalWinnerId,
          tournamentId: matchResult.tournamentId,
        },
      });
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      console.error("resolveDispute error:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  };

  // Get player notifications
  exports.getPlayerNotifications = async (req, res) => {
    try {
      const { userId } = req.user;

      // Find player profile
      const player = await Player.findOne({ where: { userId } });
      if (!player) {
        return res.status(404).json({ success: false, error: "Player profile not found" });
      }

      // Get all notifications for player
      const notifications = await Notification.findAll({
        where: {
          recipientId: player.id,
        },
        include: [
          {
            model: Player,
            as: "sender",
            attributes: ["id", "name", "nickname"],
          },
        ],
        order: [["createdAt", "DESC"]],
        limit: 50,
      });

      res.json({
        success: true,
        data: notifications,
        count: notifications.length,
        unreadCount: notifications.filter((n) => n.status === "unread").length,
      });
    } catch (error) {
      console.error("getPlayerNotifications error:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  };

  // Mark notification as read
  exports.markNotificationRead = async (req, res) => {
    try {
      const { userId } = req.user;
      const { notificationId } = req.params;

      // Find player profile
      const player = await Player.findOne({ where: { userId } });
      if (!player) {
        return res.status(404).json({ success: false, error: "Player profile not found" });
      }

      // Update notification
      const [updated] = await Notification.update(
        { status: "read" },
        {
          where: {
            id: notificationId,
            recipientId: player.id,
          },
        }
      );

      if (updated === 0) {
        return res.status(404).json({ success: false, error: "Notification not found" });
      }

      res.json({
        success: true,
        message: "Notification marked as read",
      });
    } catch (error) {
      console.error("markNotificationRead error:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  };

  // ============================================
  // ADMIN MATCH APPROVAL
  // ============================================

  // Get results awaiting admin approval for an organization
  exports.getResultsAwaitingAdminApproval = async (req, res) => {
    try {
      const { userId } = req.user;

      // Find organization profile
      const organization = await Organization.findOne({ where: { userId } });
      console.log('[getResultsAwaitingAdminApproval] User ID:', userId);
      if (!organization) {
        console.warn('[getResultsAwaitingAdminApproval] Organization not found for userId:', userId);
        return res.status(404).json({ success: false, error: "Organization profile not found" });
      }
      console.log('[getResultsAwaitingAdminApproval] Organization found:', organization.organizationName, organization.id);

      // Get all league and tournament IDs for this organization
      const leagues = await League.findAll({ where: { organizationId: organization.id }, attributes: ['id'] });
      const tournaments = await Tournament.findAll({ where: { organizationId: organization.id }, attributes: ['id'] });

      const leagueIds = leagues.map(l => l.id);
      const tournamentIds = tournaments.map(t => t.id);
      console.log('[getResultsAwaitingAdminApproval] League IDs:', leagueIds.length, 'Tournament IDs:', tournamentIds.length);

      // Get all match results awaiting admin approval, then filter in code
      const results = await MatchResult.findAll({
        where: {
          resultStatus: "Awaiting Admin Approval",
          [Op.or]: [
            { leagueId: { [Op.in]: leagueIds } },
            { tournamentId: { [Op.in]: tournamentIds } }
          ]
        },
        include: [
          {
            association: "league",
            attributes: ["id", "name", "sport"],
            required: false,
          },
          {
            model: Tournament,
            as: "tournament",
            attributes: ["id", "name", "tier"],
            required: false,
          },
          {
            model: Player,
            as: "player1",
            attributes: ["id", "name", "nickname"],
          },
          {
            association: "player2",
            attributes: ["id", "name", "nickname"],
          },
          {
            association: "submitter",
            attributes: ["id", "name", "nickname"],
          },
          {
            association: "booking",
            attributes: ["id", "bookingDate", "startTime"],
          },
        ],
        order: [["submittedAt", "ASC"]],
      });
      console.log('[getResultsAwaitingAdminApproval] Results found:', results.length);

      res.json({
        success: true,
        data: results,
        count: results.length,
        message: results.length > 0 ? `Found ${results.length} result(s)` : "No results awaiting approval",
      });
    } catch (error) {

      console.error("getResultsAwaitingAdminApproval error:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  };

  // Admin approves a match result
  exports.approveMatchResult = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { userId } = req.user;
      const { resultId } = req.params;

      // Find organization profile
      const organization = await Organization.findOne({ where: { userId }, transaction });
      if (!organization) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Organization profile not found" });
      }

      // Get match result with league AND tournament (for proper authorization)
      const matchResult = await MatchResult.findByPk(resultId, {
        include: [
          {
            model: League,
            as: "league",
            required: false,
          },
          {
            model: Tournament,
            as: "tournament",
            required: false,
          },
          {
            model: Booking,
            as: "booking",
          },
        ],
        transaction,
      });

      if (!matchResult) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Match result not found" });
      }

      // Normalize sport name
      if (matchResult.sport && (matchResult.sport.toLowerCase() === 'poker' || matchResult.sport.toLowerCase() === 'pooker')) {
        matchResult.sport = 'pooker';
      }

      // Verify organization owns the league or tournament
      const isLeagueMatch = matchResult.league && matchResult.league.organizationId === organization.id;
      const isTournamentMatch = matchResult.tournament && matchResult.tournament.organizationId === organization.id;

      if (!isLeagueMatch && !isTournamentMatch) {
        await transaction.rollback();
        return res.status(403).json({ success: false, error: "Unauthorized: You do not own this league or tournament" });
      }

      // Verify status - Accept both Pending (for walkovers) and Awaiting Admin Approval
      if (matchResult.resultStatus !== "Awaiting Admin Approval" && matchResult.resultStatus !== "Pending") {
        await transaction.rollback();
        return res.status(400).json({ success: false, error: "Result is not awaiting admin approval" });
      }

      // Update result status to Confirmed
      await matchResult.update(
        {
          resultStatus: "Confirmed",
          adminApprovedBy: organization.id,
          adminApprovedAt: new Date(),
        },
        { transaction }
      );

      // Update booking status to "completed"
      await matchResult.booking.update(
        {
          status: "completed",
        },
        { transaction }
      );

      // If there's a fixture, update it as well
      if (matchResult.fixtureId) {
        const fixture = await Fixture.findByPk(matchResult.fixtureId, { transaction });
        if (fixture) {
          // Check if this is a draw (equal scores)
          const p1Score = matchResult.sport === "pool"
            ? (matchResult.player1RackWins ?? matchResult.player1Frames ?? 0)
            : (matchResult.player1Frames ?? 0);
          const p2Score = matchResult.sport === "pool"
            ? (matchResult.player2RackWins ?? matchResult.player2Frames ?? 0)
            : (matchResult.player2Frames ?? 0);
          const isDraw = p1Score === p2Score && p1Score > 0;

          const updateData = {
            status: "completed",
          };

          // For draws, set both winnerId and loserId to null
          if (isDraw) {
            updateData.winnerId = null;
            updateData.loserId = null;
          } else {
            updateData.winnerId = matchResult.winnerId;
            updateData.loserId =
              matchResult.winnerId === matchResult.player1Id
                ? matchResult.player2Id
                : matchResult.player1Id;
          }

          if (matchResult.sport === "snooker") {
            updateData.player1Frames = matchResult.player1Frames;
            updateData.player2Frames = matchResult.player2Frames;
            updateData.resultData = matchResult.snookerFrameDetails;
          } else if (matchResult.sport === "pool") {
            updateData.player1RackWins = matchResult.player1RackWins;
            updateData.player2RackWins = matchResult.player2RackWins;
            updateData.resultData = matchResult.poolRackDetails;
          } else if (matchResult.sport === "pooker") {
            updateData.player1Frames = matchResult.player1Frames;
            updateData.player2Frames = matchResult.player2Frames;
            updateData.resultData = matchResult.pookerFrameDetails;
          }

          await fixture.update(updateData, { transaction });
        }
      }

      // Keep tournament rounds moving when admin approves tournament results.
      if (matchResult.matchType === "tournament" && matchResult.tournamentId) {
        await syncTournamentMatchCompletion({
          tournamentId: matchResult.tournamentId,
          player1Id: matchResult.player1Id,
          player2Id: matchResult.player2Id,
          matchResult,
          transaction,
        });
      }

      // ✅ BADGE TYPE LOGIC: Update players from "Casual" to "Verified" on first official match
      if (matchResult.matchType === "league" && matchResult.leagueId) {
        const player1 = await Player.findByPk(matchResult.player1Id, { transaction });
        const player2 = await Player.findByPk(matchResult.player2Id, { transaction });

        if (player1 && player1.badgeType === "Casual") {
          await player1.update({ badgeType: "Verified" }, { transaction });
        }
        if (player2 && player2.badgeType === "Casual") {
          await player2.update({ badgeType: "Verified" }, { transaction });
        }
      }

      await transaction.commit();

      // Update league standings AFTER transaction commit so it sees the 'Confirmed' status
      if (matchResult.matchType === "league" && matchResult.leagueId) {
        standingsService.updateLeagueStandings(matchResult.leagueId).catch(err => {
          console.error(`[approveMatchResult] Error updating standings:`, err.message);
        });
      }

      // Run advancement logic after transaction commit
      if (matchResult.matchType === "league" && matchResult.leagueId) {
        setTimeout(async () => {
          // Advancement & Completion logic after standings are updated
          try {
            const { advanceKnockoutWinner, checkAndUpdateSwissPairings, checkLeagueCompletion } = require('../services/fixtureGenerator');

            if (matchResult.fixtureId) {
              const fixture = await Fixture.findByPk(matchResult.fixtureId);
              if (fixture) {
                // 1. Advance Knockout
                if (fixture.stage === 'knockout' || fixture.stage === 'groupsKnockout') {
                  await advanceKnockoutWinner(fixture.id, matchResult.winnerId).catch(err => console.error('[approveMatchResult] KO advance error:', err.message));
                }
                // 2. Update Swiss
                if (fixture.stage === 'swiss') {
                  await checkAndUpdateSwissPairings(matchResult.leagueId, fixture.round, fixture.divisionId).catch(err => console.error('[approveMatchResult] Swiss update error:', err.message));
                }
              }
            }
            // 3. Final completion check (covers Round Robin and all others)
            await checkLeagueCompletion(matchResult.leagueId);
          } catch (advError) {
            console.error(`[approveMatchResult] Match advancement/completion error:`, advError.message);
          }
        }, 0);
      }

      res.json({
        success: true,
        message: "Match result approved successfully and standings updated.",
        data: {
          matchResult: {
            id: matchResult.id,
            tournamentId: matchResult.tournamentId,
            leagueId: matchResult.leagueId,
          }
        }
      });
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      console.error("approveMatchResult error:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  };

  // ============================================
  // APPROVE/REJECT WALKOVER (Admin Only)
  // ============================================
  exports.approveRejectWalkover = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { userId } = req.user;
      const { resultId } = req.params;
      const { action, rejectionReason } = req.body; // action: 'approve' or 'reject'

      if (!['approve', 'reject'].includes(action)) {
        await transaction.rollback();
        return res.status(400).json({ success: false, error: "Action must be 'approve' or 'reject'" });
      }

      // Find organization profile
      const organization = await Organization.findOne({ where: { userId }, transaction });
      if (!organization) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Organization profile not found" });
      }

      // Get match result with league AND tournament (for proper authorization)
      const matchResult = await MatchResult.findByPk(resultId, {
        include: [
          {
            model: League,
            as: "league",
            required: false,
          },
          {
            model: Tournament,
            as: "tournament",
            required: false,
          },
          {
            model: Booking,
            as: "booking",
          },
          {
            model: Fixture,
            as: "fixture",
          }
        ],
        transaction,
      });

      if (!matchResult) {
        await transaction.rollback();
        return res.status(404).json({ success: false, error: "Match result not found" });
      }

      // Verify it's a walkover
      const resultData = matchResult.resultData || {};
      if (!resultData.isWalkover && !matchResult.isWalkover) {
        await transaction.rollback();
        return res.status(400).json({ success: false, error: "This result is not a walkover" });
      }

      // Verify organization owns the league or tournament
      const isLeagueMatch = matchResult.league && matchResult.league.organizationId === organization.id;
      const isTournamentMatch = matchResult.tournament && matchResult.tournament.organizationId === organization.id;

      if (!isLeagueMatch && !isTournamentMatch) {
        await transaction.rollback();
        return res.status(403).json({ success: false, error: "Unauthorized: You do not own this league or tournament" });
      }

      // Verify result is awaiting admin approval
      if (matchResult.resultStatus !== "Awaiting Admin Approval") {
        await transaction.rollback();
        return res.status(400).json({ success: false, error: "Walkover is not pending admin approval" });
      }

      if (action === 'approve') {
        // Approve walkover - set to Confirmed
        const points = matchResult.league.pointsSystem ?
          (typeof matchResult.league.pointsSystem === 'string' ?
            JSON.parse(matchResult.league.pointsSystem) :
            matchResult.league.pointsSystem) :
          { win: 3, loss: 0 };

        // Parse Match Rules for default walkover scores
        let matchRules = matchResult.league?.matchRules || {};
        if (typeof matchRules === 'string') {
          try { matchRules = JSON.parse(matchRules); } catch (e) { matchRules = {}; }
        }

        const walkoverRule = matchRules.walkover?.rule || null;
        const customWalkover = matchRules.walkover?.customScore || null;
        const bestOf = parseInt(matchRules.bestOf || matchRules.customFrames) || 5;

        let defaultWinScore = null;
        let defaultLoseScore = 0;

        if (walkoverRule === 'autoBestOf') {
          let totalFrames = 5;
          if (matchRules.bestOf === 'custom') {
            totalFrames = parseInt(matchRules.customFrames) || 5;
          } else if (matchRules.bestOf) {
            totalFrames = parseInt(matchRules.bestOf) || 5;
          } else {
            const matchFormatStr = matchResult.league?.matchFormat || "Best of 5";
            const m = matchFormatStr.match(/\d+/);
            totalFrames = m ? parseInt(m[0]) : 5;
          }
          defaultWinScore = totalFrames;
        } else if (walkoverRule === 'auto2-0') {
          defaultWinScore = 2;
        } else if (walkoverRule === 'auto5-0') {
          defaultWinScore = 5;
        } else if (walkoverRule === 'custom' && customWalkover) {
          const parsed = String(customWalkover).split('-').map(Number);
          if (parsed.length === 2 && !Number.isNaN(parsed[0]) && !Number.isNaN(parsed[1])) {
            defaultWinScore = parsed[0];
            defaultLoseScore = parsed[1];
          }
        }

        if (defaultWinScore === null) {
          defaultWinScore = Math.ceil(bestOf / 2);
        }

        const adminWalkoverScore = req.body.customWalkoverScore || req.body.walkoverScore || null;
        let adminWinScore = null;
        let adminLoseScore = null;

        if (adminWalkoverScore) {
          const parsed = String(adminWalkoverScore).split('-').map(Number);
          if (parsed.length === 2 && !Number.isNaN(parsed[0]) && !Number.isNaN(parsed[1])) {
            adminWinScore = parsed[0];
            adminLoseScore = parsed[1];
          }
        }

        const isP1Winner = matchResult.winnerId === matchResult.player1Id;
        const configuredWinScore = adminWinScore !== null ? adminWinScore : defaultWinScore;
        const configuredLoseScore = adminLoseScore !== null ? adminLoseScore : defaultLoseScore;

        // For walkovers, always use the configured scores (rule-based or admin custom)
        const s1 = isP1Winner ? configuredWinScore : configuredLoseScore;
        const s2 = isP1Winner ? configuredLoseScore : configuredWinScore;

        const finalWalkoverScore = `${isP1Winner ? `${s1}-${s2}` : `${s1}-${s2}`}`; // data from s1,s2 already aligned to winner

        // Approve walkover - set to Confirmed
        const normalizedSport = String(matchResult.sport || '').toLowerCase();
        await matchResult.update(
          {
            resultStatus: "Confirmed",
            adminApprovedBy: organization.id,
            adminApprovedAt: new Date(),
            isWalkover: true, // Explicitly set top-level flag
            player1Frames: normalizedSport !== 'pool' ? s1 : null,
            player2Frames: normalizedSport !== 'pool' ? s2 : null,
            player1RackWins: normalizedSport === 'pool' ? s1 : null,
            player2RackWins: normalizedSport === 'pool' ? s2 : null,
            walkoverScore: `${s1}-${s2}`,
            resultData: {
              ...(matchResult.resultData || {}),
              isWalkover: true,
              walkoverScore: `${s1}-${s2}`,
              walkoverApprovedAt: new Date(),
              approvedByAdminId: organization.id,
            }
          },
          { transaction }
        );

        // Update booking status to completed
        if (matchResult.booking) {
          await matchResult.booking.update(
            { status: "completed" },
            { transaction }
          );
        }

        // Update fixture if exists - syncing scores to fixture is CRITICAL for standings and UI
        if (matchResult.fixture) {
          await matchResult.fixture.update(
            {
              status: "completed",
              winnerId: matchResult.winnerId,
              loserId: matchResult.winnerId === matchResult.player1Id ? matchResult.player2Id : matchResult.player1Id,
              player1Frames: normalizedSport !== 'pool' ? s1 : null,
              player2Frames: normalizedSport !== 'pool' ? s2 : null,
              player1RackWins: normalizedSport === 'pool' ? s1 : null,
              player2RackWins: normalizedSport === 'pool' ? s2 : null,
              detailedStatus: "WALKOVER",
              resultData: {
                ...(matchResult.resultData || {}),
                isWalkover: true,
                walkoverScore: `${s1}-${s2}`,
                walkoverApprovedAt: new Date(),
                approvedByAdminId: organization.id,
              }
            },
            { transaction }
          );
        }

        await transaction.commit();

        // Handle tournament match completion
        if (matchResult.matchType === "tournament" && matchResult.tournamentId) {
          await syncTournamentMatchCompletion({
            tournamentId: matchResult.tournamentId,
            player1Id: matchResult.player1Id,
            player2Id: matchResult.player2Id,
            matchResult,
            transaction: null,
          });
        }

        // Update standings in background
        if (matchResult.matchType === "league" && matchResult.leagueId) {
          standingsService.updateLeagueStandings(matchResult.leagueId).then(async () => {
            // Advancement & Completion logic after standings are updated
            try {
              const { advanceKnockoutWinner, checkAndUpdateSwissPairings, checkLeagueCompletion } = require('../services/fixtureGenerator');

              if (matchResult.fixtureId) {
                const fixture = await Fixture.findByPk(matchResult.fixtureId);
                if (fixture) {
                  // 1. Advance Knockout
                  if (fixture.stage === 'knockout' || fixture.stage === 'groupsKnockout') {
                    const winnerId = matchResult.winnerId;
                    if (winnerId) await advanceKnockoutWinner(fixture.id, winnerId).catch(err => console.error('[approveWalkover] KO advance error:', err.message));
                  }
                  // 2. Update Swiss
                  if (fixture.stage === 'swiss') {
                    await checkAndUpdateSwissPairings(matchResult.leagueId, fixture.round, fixture.divisionId).catch(err => console.error('[approveWalkover] Swiss update error:', err.message));
                  }
                }
              }
              // 3. Final completion check (covers Round Robin and all others)
              await checkLeagueCompletion(matchResult.leagueId);
            } catch (advError) {
              console.error(`[approveRejectWalkover] Match advancement/completion error:`, advError.message);
            }
          }).catch(err => {
            console.error(`[approveRejectWalkover] Error updating standings:`, err);
          });
        }
        return res.json({
          success: true,
          message: "Walkover approved successfully. Points awarded.",
          data: {
            matchResult: {
              id: matchResult.id,
              tournamentId: matchResult.tournamentId,
              leagueId: matchResult.leagueId,
            }
          }
        });

      } else if (action === 'reject') {
        // Reject walkover
        if (!rejectionReason) {
          await transaction.rollback();
          return res.status(400).json({ success: false, error: "Rejection reason is required" });
        }

        // Fetch player details for emails
        const p1 = await Player.findByPk(matchResult.player1Id, { include: [{ model: User, as: "user", attributes: ["email"] }], transaction });
        const p2 = await Player.findByPk(matchResult.player2Id, { include: [{ model: User, as: "user", attributes: ["email"] }], transaction });

        // Send rejection emails asynchronously
        const emailTasks = [];
        const emailData = {
          leagueName: matchResult.league?.name || 'League Match',
          fixtureRound: matchResult.fixture?.round || 'N/A',
          rejectionReason: rejectionReason
        };

        if (p1 && p1.user && p1.user.email) {
          emailTasks.push(sendWalkoverRejectedEmail({
            playerEmail: p1.user.email,
            playerName: p1.nickname || p1.name,
            opponentName: p2 ? (p2.nickname || p2.name) : 'opponent',
            ...emailData
          }).catch(err => console.error('[approveRejectWalkover] Email error p1:', err)));
        }

        if (p2 && p2.user && p2.user.email) {
          emailTasks.push(sendWalkoverRejectedEmail({
            playerEmail: p2.user.email,
            playerName: p2.nickname || p2.name,
            opponentName: p1 ? (p1.nickname || p1.name) : 'opponent',
            ...emailData
          }).catch(err => console.error('[approveRejectWalkover] Email error p2:', err)));
        }

        await Promise.all(emailTasks);

        // Mark fixture as cancelled (not completed) and reopen
        if (matchResult.fixture) {
          await matchResult.fixture.update(
            {
              status: "scheduled", // Back to scheduled, not completed
              winnerId: null,
              loserId: null,
              resultData: {
                ...resultData,
                walkoverRejectedAt: new Date(),
                rejectionReason: rejectionReason,
                note: "Walkover was rejected by admin. Fixture remains open for result submission."
              }
            },
            { transaction }
          );
        }

        // Destroy the rejected match result to free up the unique bookingId
        // and allow a new regular result to be submitted for this match.
        await matchResult.destroy({ transaction });

        await transaction.commit();
        return res.json({
          success: true,
          message: "Walkover rejected. Result cancelled and fixture reopened.",
          deletedId: resultId // Inform frontend that this result object has been removed
        });
      }

    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      console.error("approveRejectWalkover error:", error);
      res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  };

  // ============================================
  // GET DIVISIONS BY LEAGUE
  // ============================================
  exports.getDivisionsByLeague = async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { userId } = req.user;

      console.log("[getDivisionsByLeague] Request:", { leagueId, userId });

      // Verify league exists
      const league = await League.findByPk(leagueId);
      if (!league) {
        console.error("[getDivisionsByLeague] League not found:", leagueId);
        return res.status(404).json({ success: false, error: "League not found" });
      }

      console.log("[getDivisionsByLeague] League found:", { id: league.id, name: league.name, organizationId: league.organizationId });

      // Check if user is organization
      let organization = null;
      try {
        organization = await Organization.findOne({ where: { userId } });
      } catch (e) {
        console.log("[getDivisionsByLeague] Not an organization account");
      }

      // If organization, verify they own the league
      if (organization && league.organizationId !== organization.id) {
        console.error("[getDivisionsByLeague] Organization does not own this league");
        return res.status(403).json({ success: false, error: "Unauthorized: You do not own this league" });
      }

      // Get all divisions for this league (regardless of status)
      const divisions = await Division.findAll({
        where: {
          leagueId,
        },
        attributes: ["id", "name", "numberOfFrames", "raceLength", "maxPlayers", "description", "status"],
        order: [["name", "ASC"]],
      });

      console.log("[getDivisionsByLeague] Query executed:", {
        leagueId,
        totalDivisionsFound: divisions.length,
        divisionDetails: divisions.map(d => ({
          id: d.id,
          name: d.name,
          status: d.status
        }))
      });

      // If no divisions found, log for debugging
      if (divisions.length === 0) {
        console.warn("[getDivisionsByLeague] No divisions found for league:", { leagueId, leagueName: league.name });
      }

      res.json({
        success: true,
        data: divisions,
        count: divisions.length,
        message: divisions.length > 0
          ? "Divisions retrieved successfully"
          : `No divisions found in ${league.name}. Please create divisions using the organization dashboard.`,
      });
    } catch (error) {
      console.error("getDivisionsByLeague error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ============================================
  // GET MATCHES BY DIVISION
  // ============================================
  exports.getMatchesByDivision = async (req, res) => {
    try {
      const { divisionId } = req.params;
      const { userId } = req.user;

      console.log("[getMatchesByDivision] Request:", { divisionId, userId });

      // Verify division exists
      const division = await Division.findByPk(divisionId, {
        include: [
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "sport", "organizationId"],
          },
        ],
      });

      if (!division) {
        console.error("[getMatchesByDivision] Division not found:", divisionId);
        return res.status(404).json({ success: false, error: "Division not found" });
      }

      console.log("[getMatchesByDivision] Division found:", {
        id: division.id,
        name: division.name,
        leagueId: division.leagueId,
        league: division.league.name
      });

      // Check if user is a player or organization
      // Players can view matches they're involved in
      // Organizations can view all matches in their leagues
      let player = null;
      let organization = null;

      try {
        player = await Player.findOne({ where: { userId } });
      } catch (e) {
        console.log("[getMatchesByDivision] Not a player account");
      }

      try {
        organization = await Organization.findOne({ where: { userId } });
      } catch (e) {
        console.log("[getMatchesByDivision] Not an organization account");
      }

      if (!player && !organization) {
        console.error("[getMatchesByDivision] User is neither player nor organization:", userId);
        return res.status(404).json({ success: false, error: "User profile not found" });
      }

      // If organization, verify they own the league
      if (organization && division.league.organizationId !== organization.id) {
        console.error("[getMatchesByDivision] Organization does not own this league");
        return res.status(403).json({ success: false, error: "Unauthorized: You do not own this league" });
      }

      // ============================================
      // Query match_results for this division
      // This is more robust and doesn't require fixtures to exist
      // ============================================
      console.log("[getMatchesByDivision] Querying match_results for leagueId:", division.leagueId);

      // DEBUG: First check raw match_results count
      const rawMatchResultsCount = await MatchResult.count({
        where: {
          leagueId: division.leagueId,
          matchType: "league",
        },
      });
      console.log("[getMatchesByDivision] Raw match results count in DB:", rawMatchResultsCount);

      const matchResults = await MatchResult.findAll({
        attributes: [
          "id", "bookingId", "fixtureId", "leagueId", "tournamentId", "matchType", "sport",
          "submittedBy", "player1Id", "player2Id", "player1Frames", "player2Frames",
          "snookerFrameDetails", "pookerFrameDetails", "player1RackWins", "player2RackWins", "poolRackDetails",
          "winnerId", "resultStatus", "submittedAt", "confirmedBy",
          "confirmedAt", "disputeReason", "notes", "imageUrl", "createdAt", "updatedAt"
        ],
        where: {
          leagueId: division.leagueId,
          matchType: "league",
        },
        include: [
          {
            model: Booking,
            as: "booking",
            required: true,
            attributes: ["id", "fixtureId", "playerId", "opponentId", "bookingDate", "startTime", "endTime", "tableName", "tableNumber", "status"],
            // Accept both 'confirmed' and 'completed' booking statuses
            where: {
              status: {
                [Op.in]: ["confirmed", "completed"]
              }
            },
            include: [
              {
                model: Fixture,
                as: "fixture",
                required: false, // LEFT JOIN - optional
                attributes: ["id", "divisionId", "round", "matchNumber"],
              },
              {
                model: Player,
                as: "player",
                required: false,
                attributes: ["id", "name", "nickname"],
                include: [
                  {
                    model: User,
                    as: "user",
                    attributes: ["id", "email"],
                    required: false,
                  },
                ],
              },
              {
                model: Player,
                as: "opponent",
                required: false,
                attributes: ["id", "name", "nickname"],
                include: [
                  {
                    model: User,
                    as: "user",
                    attributes: ["id", "email"],
                    required: false,
                  },
                ],
              },
            ],
          },
        ],
        order: [[{ model: Booking, as: "booking" }, "bookingDate", "DESC"]],
      });

      console.log("[getMatchesByDivision] Total match results found for league:", matchResults.length);

      // DEBUG: If no results with confirmed bookings, check without status filter
      if (matchResults.length === 0) {
        const allMatchResultsForLeague = await MatchResult.findAll({
          where: {
            leagueId: division.leagueId,
            matchType: "league",
          },
          include: [
            {
              model: Booking,
              as: "booking",
              required: false,
              attributes: ["id", "status", "fixtureId"],
            },
          ],
          limit: 5,
        });
        console.log("[getMatchesByDivision] DEBUG - All match results for league (any booking status):", allMatchResultsForLeague.length);
        allMatchResultsForLeague.forEach((mr, i) => {
          console.log(`[getMatchesByDivision] DEBUG - Match ${i + 1}:`, {
            id: mr.id,
            bookingId: mr.bookingId,
            hasBooking: !!mr.booking,
            bookingStatus: mr.booking?.status,
          });
        });
      }

      // DEBUG: Log each match result to see the data structure
      matchResults.forEach((mr, index) => {
        console.log(`[getMatchesByDivision] Match ${index + 1}:`, {
          id: mr.id,
          leagueId: mr.leagueId,
          bookingId: mr.bookingId,
          hasBooking: !!mr.booking,
          bookingStatus: mr.booking?.status,
          fixtureId: mr.booking?.fixtureId,
          hasFixture: !!mr.booking?.fixture,
          fixtureDivisionId: mr.booking?.fixture?.divisionId,
        });
      });

      // Filter to only include matches for this specific division
      // Check both fixture.divisionId and if fixture is null (fallback)
      const divisionMatchResults = matchResults.filter(mr => {
        const booking = mr.booking;
        const fixture = booking?.fixture;

        // Include if:
        // 1. Fixture exists and matches this division
        // 2. Fixture doesn't exist (fallback to show all league matches)
        if (fixture && fixture.divisionId) {
          const matches = fixture.divisionId === divisionId;
          console.log(`[getMatchesByDivision] Match ${mr.id} fixture division check:`, {
            fixtureDivisionId: fixture.divisionId,
            requestedDivisionId: divisionId,
            matches
          });
          return matches;
        }
        // If no fixture linkage, include it (this handles cases where fixtures weren't created)
        console.log(`[getMatchesByDivision] Match ${mr.id} included (no fixture linkage)`);
        return true;
      });

      console.log("[getMatchesByDivision] Match results filtered for division:", divisionMatchResults.length);

      // Format match results for response
      const matches = divisionMatchResults.map((matchResult) => {
        const booking = matchResult.booking;
        const fixture = booking?.fixture;

        let score = "";
        let gameType = "";

        // Determine score and game type
        if (matchResult.sport === "snooker" || matchResult.sport === "pooker") {
          score = `${matchResult.player1Frames || 0} - ${matchResult.player2Frames || 0}`;
          gameType = matchResult.sport;
        } else if (matchResult.sport === "pool") {
          score = `${matchResult.player1RackWins || 0} - ${matchResult.player2RackWins || 0}`;
          gameType = "pool";
        } else {
          gameType = matchResult.sport || division.league.sport || "unknown";
        }

        // Include frame/rack details for detailed view
        let frameDetails = null;

        if (gameType === "snooker") {
          frameDetails = safeParseJSON(matchResult.snookerFrameDetails);
        } else if (gameType === "pooker") {
          frameDetails = safeParseJSON(matchResult.pookerFrameDetails);
        } else if (gameType === "pool") {
          frameDetails = safeParseJSON(matchResult.poolRackDetails);
        }

        // Helper for nested parsing
        function safeParseJSON(data) {
          if (!data) return null;
          if (typeof data === 'object') return data;
          try {
            return JSON.parse(data);
          } catch (e) {
            return null;
          }
        }

        return {
          id: matchResult.id,
          fixtureId: booking.fixtureId || null,
          bookingId: booking.id,
          submitter: {
            id: booking.player?.id || null,
            name: booking.player?.name || "Unknown",
            nickname: booking.player?.nickname || "",
          },
          opponent: {
            id: booking.opponent?.id || null,
            name: booking.opponent?.name || "Unknown",
            nickname: booking.opponent?.nickname || "",
          },
          score,
          gameType,
          frameDetails, // Include frame-by-frame or rack-by-rack details
          date: booking.bookingDate,
          startTime: booking.startTime,
          endTime: booking.endTime,
          tableName: booking.tableName,
          tableNumber: booking.tableNumber,
          round: fixture?.round || null,
          matchNumber: fixture?.matchNumber || null,
          resultSubmittedAt: matchResult.createdAt,
        };
      });

      console.log("[getMatchesByDivision] Final matches count:", matches.length);

      // Prepare and send response
      const response = {
        success: true,
        data: {
          currentSelection: {
            division: {
              id: division.id,
              name: division.name,
            },
            league: {
              id: division.league.id,
              name: division.league.name,
            },
            game: division.league.sport,
          },
          matches,
          totalMatches: matches.length,
        },
        message: matches.length > 0
          ? `${matches.length} match${matches.length !== 1 ? 'es' : ''} found for ${division.name}`
          : `No match results yet for ${division.name}. Match results will appear here once they are submitted.`,
      };

      res.json(response);
    } catch (error) {
      console.error("getMatchesByDivision error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ============================================
  // GENERATE TEST DATA (Development Only)
  // ============================================
  exports.generateTestData = async (req, res) => {
    try {
      const { userId } = req.user;

      // Find player
      const player = await Player.findOne({ where: { userId } });
      if (!player) {
        return res.status(404).json({ success: false, error: "Player not found" });
      }

      // Find all divisions for this player's organization
      const divisions = await Division.findAll({
        include: [
          {
            model: League,
            as: "league",
            where: {
              organizationId: player.organizationId,
            },
            attributes: ["id", "name", "sport"],
          },
        ],
      });

      if (divisions.length === 0) {
        return res.status(404).json({ success: false, error: "No divisions found for your organization" });
      }

      const createdData = [];

      // For each division, create a fixture, booking, and match result
      for (const division of divisions) {
        try {
          // Get another player from the organization to be the opponent
          const opponents = await Player.findAll({
            where: {
              organizationId: player.organizationId,
              id: { [Op.ne]: player.id }, // Not the current player
            },
            limit: 1,
          });

          const opponent = opponents.length > 0 ? opponents[0] : player; // Use same player if no others
          console.log(`Using opponent: ${opponent.id} (${opponent.name || "Unknown"})`);

          // Create fixture with ALL required fields
          const fixture = await Fixture.create({
            leagueId: division.league.id, // REQUIRED: League ID
            divisionId: division.id,
            player1Id: player.id, // REQUIRED: Player 1 (fixture creator)
            player2Id: opponent.id, // REQUIRED: Player 2 (opponent)
            round: 1,
            matchNumber: 1,
            scheduledDate: new Date(Date.now() + 86400000), // Tomorrow
            status: "scheduled", // REQUIRED: Fixture status
          });

          console.log(`Created fixture: ${fixture.id} for division ${division.id} with players ${player.id} vs ${opponent.id}`);

          // Create booking
          const booking = await Booking.create({
            fixtureId: fixture.id,
            leagueId: division.league.id,
            playerId: player.id,
            opponentId: opponent.id,
            bookingDate: new Date(),
            startTime: "19:00",
            endTime: "20:00",
            tableName: "Table 1",
            tableNumber: 1,
            status: "confirmed",
            confirmedAt: new Date(),
            confirmedBy: opponent.id,
          });

          console.log(`Created booking: ${booking.id}`);

          // Create match result based on league sport
          let matchResult;
          const resultData = {
            bookingId: booking.id,
            fixtureId: fixture.id,
            leagueId: division.league.id,
            matchType: "league",
            submittedBy: player.id,
            sport: division.league.sport,
            player1Id: player.id,
            player2Id: opponent.id,
            winnerId: player.id,
            resultStatus: "Confirmed",
            confirmedBy: opponent.id,
            confirmedAt: new Date(),
          };

          if (division.league.sport === "snooker") {
            resultData.player1Frames = 5;
            resultData.player2Frames = 3;
          } else if (division.league.sport === "pool") {
            resultData.player1RackWins = 3;
            resultData.player2RackWins = 1;
          }

          matchResult = await MatchResult.create(resultData);

          console.log(`Created match result: ${matchResult.id}`);

          createdData.push({
            division: division.name,
            league: division.league.name,
            sport: division.league.sport,
            fixtureId: fixture.id,
            bookingId: booking.id,
            matchResultId: matchResult.id,
          });
        } catch (error) {
          console.error(`\n❌ ERROR creating test data for division ${division.id}:`);
          console.error(`   Division: ${division.name} (${division.id})`);
          console.error(`   League: ${division.league.name} (${division.league.id})`);
          console.error(`   Error Message: ${error.message}`);
          console.error(`   Error Code: ${error.code}`);
          if (error.original) {
            console.error(`   Database Error: ${error.original.message}`);
          }
          console.error(`   Full Stack:`, error.stack);
        }
      }

      res.json({
        success: true,
        data: {
          createdCount: createdData.length,
          details: createdData,
        },
        message: createdData.length > 0
          ? `✅ Successfully created ${createdData.length} test fixture(s) with booking(s) and match result(s). Refresh your browser to see the data.`
          : `⚠️ No test data could be created. Check the server logs for errors.`,
      });
    } catch (error) {
      console.error("\n❌ generateTestData global error:");
      console.error(`   Error Message: ${error.message}`);
      console.error(`   Error Code: ${error.code}`);
      if (error.original) {
        console.error(`   Database Error: ${error.original.message}`);
      }
      console.error(`   Full Stack:`, error.stack);
      res.status(500).json({
        success: false,
        error: "Failed to generate test data",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ============================================
  // GENERATE TEST DATA FOR SPECIFIC DIVISION
  // ============================================
  exports.generateTestDataForDivision = async (req, res) => {
    try {
      const { divisionId } = req.params;
      const { userId } = req.user;

      console.log(`\n📊 [generateTestDataForDivision] Starting for division: ${divisionId}`);

      // Find player
      const player = await Player.findOne({ where: { userId } });
      if (!player) {
        return res.status(404).json({ success: false, error: "Player not found" });
      }

      // Find division with league
      const division = await Division.findByPk(divisionId, {
        include: [
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "sport"],
          },
        ],
      });

      if (!division) {
        return res.status(404).json({ success: false, error: "Division not found" });
      }

      // Verify division belongs to same organization
      if (division.league.organizationId !== player.organizationId) {
        return res.status(403).json({ success: false, error: "You don't have access to this division" });
      }

      console.log(`✅ Division found: ${division.name} (League: ${division.league.name}, Sport: ${division.league.sport})`);

      // Get opponent player from same organization
      const opponents = await Player.findAll({
        where: {
          organizationId: player.organizationId,
          id: { [Op.ne]: player.id },
        },
        limit: 1,
      });

      const opponent = opponents.length > 0 ? opponents[0] : player;
      console.log(`👥 Players: ${player.name} vs ${opponent.name}`);

      const createdData = [];

      // Create 3 test fixtures with bookings and match results
      for (let i = 1; i <= 3; i++) {
        try {
          console.log(`\n📋 Creating fixture ${i}...`);

          // Create fixture with ALL required fields
          const fixture = await Fixture.create({
            leagueId: division.league.id,
            divisionId: division.id,
            player1Id: player.id,
            player2Id: opponent.id,
            round: i,
            matchNumber: i,
            scheduledDate: new Date(Date.now() + i * 86400000),
            status: "scheduled",
          });
          console.log(`  ✓ Fixture created: ${fixture.id}`);

          // Create confirmed booking
          const booking = await Booking.create({
            fixtureId: fixture.id,
            leagueId: division.league.id,
            playerId: player.id,
            opponentId: opponent.id,
            bookingDate: new Date(Date.now() - (4 - i) * 86400000), // Past dates
            startTime: "19:00",
            endTime: "20:00",
            tableName: `Table ${i}`,
            tableNumber: i,
            status: "confirmed",
            confirmedAt: new Date(),
            confirmedBy: opponent.id,
          });
          console.log(`  ✓ Booking created: ${booking.id} (status: confirmed)`);

          // Create match result with correct fields
          const resultData = {
            bookingId: booking.id,
            fixtureId: fixture.id,
            leagueId: division.league.id,
            matchType: "league",
            submittedBy: player.id,
            sport: division.league.sport,
            player1Id: player.id,
            player2Id: opponent.id,
            winnerId: player.id,
            resultStatus: "Confirmed",
            confirmedBy: opponent.id,
            confirmedAt: new Date(),
          };

          // Add sport-specific scores
          if (division.league.sport === "snooker") {
            resultData.player1Frames = 5 - i;
            resultData.player2Frames = i;
          } else if (division.league.sport === "pool") {
            resultData.player1RackWins = 4 - i;
            resultData.player2RackWins = i;
          }

          const matchResult = await MatchResult.create(resultData);
          console.log(`  ✓ MatchResult created: ${matchResult.id} (resultStatus: Confirmed)`);

          createdData.push({
            fixture: { id: fixture.id, round: fixture.round },
            booking: { id: booking.id, status: "confirmed" },
            matchResult: {
              id: matchResult.id,
              resultStatus: "Confirmed",
              score: division.league.sport === "snooker"
                ? `${resultData.player1Frames}-${resultData.player2Frames}`
                : division.league.sport === "pool"
                  ? `${resultData.player1RackWins}-${resultData.player2RackWins}`
                  : "N/A",
            },
          });
        } catch (error) {
          console.error(`  ❌ Error creating fixture ${i}: ${error.message}`);
        }
      }

      console.log(`\n✨ Test data generation complete. Created ${createdData.length} complete match records.\n`);

      res.json({
        success: true,
        data: {
          division: {
            id: division.id,
            name: division.name,
            league: { id: division.league.id, name: division.league.name, sport: division.league.sport },
          },
          players: {
            player1: { id: player.id, name: player.name },
            player2: { id: opponent.id, name: opponent.name },
          },
          createdCount: createdData.length,
          details: createdData,
        },
        message: createdData.length > 0
          ? `✅ Successfully created ${createdData.length} test match(es) for ${division.name}. Refresh your browser to see the results!`
          : `⚠️ Failed to create test data. Check server logs for errors.`,
      });
    } catch (error) {
      console.error("\n❌ generateTestDataForDivision error:");
      console.error(`   Error: ${error.message}`);
      if (error.original) {
        console.error(`   Database Error: ${error.original.message}`);
      }
      console.error(error.stack);
      res.status(500).json({
        success: false,
        error: "Failed to generate test data",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ============================================
  // DIAGNOSTIC ENDPOINTS
  // ============================================

  // Quick diagnostic - shows what data exists for a division
  exports.diagnosticQuick = async (req, res) => {
    try {
      const { divisionId } = req.params;

      // Get division
      const division = await Division.findByPk(divisionId, {
        include: [
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "sport"],
          },
        ],
      });

      if (!division) {
        return res.status(404).json({ success: false, error: "Division not found" });
      }

      // Get fixtures
      const fixtures = await Fixture.findAll({
        where: { divisionId },
        raw: true,
      });

      // Get all bookings for these fixtures
      let allBookings = [];
      if (fixtures.length > 0) {
        allBookings = await Booking.findAll({
          where: { fixtureId: fixtures.map(f => f.id) },
          raw: true,
        });
      }

      // Get all match results
      let allMatchResults = [];
      if (allBookings.length > 0) {
        allMatchResults = await MatchResult.findAll({
          where: { bookingId: allBookings.map(b => b.id) },
          raw: true,
        });
      }

      // Count confirmed bookings with results
      const confirmedBookings = allBookings.filter(b => b.status === "confirmed").length;
      const confirmedWithResults = allBookings.filter(b =>
        b.status === "confirmed" && allMatchResults.some(m => m.bookingId === b.id)
      ).length;

      // Determine what's missing
      let status = "";
      let nextStep = "";
      if (fixtures.length === 0) {
        status = "❌ No fixtures exist";
        nextStep = "Create fixtures for this division";
      } else if (allBookings.length === 0) {
        status = "⚠️ Fixtures exist but no bookings";
        nextStep = "Create and confirm bookings for the fixtures";
      } else if (confirmedBookings === 0) {
        status = "⚠️ Bookings exist but none are confirmed";
        nextStep = "Confirm the bookings";
      } else if (confirmedWithResults === 0) {
        status = "⚠️ Confirmed bookings exist but no match results";
        nextStep = "Submit match results for the bookings";
      } else {
        status = `✅ Complete! ${confirmedWithResults} match result(s) ready to display`;
        nextStep = "Refresh the page to see match results";
      }

      res.json({
        success: true,
        division: {
          id: division.id,
          name: division.name,
          league: division.league.name,
          sport: division.league.sport,
        },
        checks: {
          fixtures: fixtures.length,
          bookings: allBookings.length,
          confirmed_bookings: confirmedBookings,
          match_results: allMatchResults.length,
          complete_matches: confirmedWithResults,
        },
        status,
        nextStep,
        recommendation: confirmedWithResults === 0
          ? `Call POST /api/match-results/test-data/division/${divisionId}/generate to auto-create test data`
          : "Refresh your browser",
      });
    } catch (error) {
      console.error("diagnosticQuick error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  };

  // Check all fixtures in a division with detailed info
  exports.diagnosticDivisionFixtures = async (req, res) => {
    try {
      const { divisionId } = req.params;

      // Get division
      const division = await Division.findByPk(divisionId, {
        include: [
          {
            model: League,
            as: "league",
            attributes: ["id", "name", "sport"],
          },
        ],
      });

      if (!division) {
        return res.status(404).json({ success: false, error: "Division not found" });
      }

      // Get all fixtures (without any filters)
      const fixtures = await Fixture.findAll({
        where: { divisionId },
        include: [
          {
            model: Player,
            as: "player1",
            attributes: ["id", "name"],
          },
          {
            model: Player,
            as: "player2",
            attributes: ["id", "name"],
          },
        ],
      });

      // For each fixture, get booking and match result counts
      const fixtureDetails = await Promise.all(
        fixtures.map(async (fixture) => {
          const bookings = await Booking.findAll({
            where: { fixtureId: fixture.id },
            attributes: ["id", "status", "playerId", "opponentId", "bookingDate"],
          });

          const matchResults = await MatchResult.findAll({
            where: { bookingId: bookings.map(b => b.id) },
            attributes: ["id", "bookingId", "resultStatus"],
          });

          return {
            fixtureId: fixture.id,
            round: fixture.round,
            matchNumber: fixture.matchNumber,
            player1: { id: fixture?.player1?.id, name: fixture?.player1?.name },
            player2: { id: fixture?.player2?.id, name: fixture?.player2?.name },
            status: fixture.status,
            bookingsCount: bookings.length,
            bookingDetails: bookings.map(b => ({
              id: b.id,
              status: b.status,
            })),
            matchResultsCount: matchResults.length,
            matchResultDetails: matchResults.map(m => ({
              id: m.id,
              bookingId: m.bookingId,
              resultStatus: m.resultStatus,
            })),
          };
        })
      );

      res.json({
        success: true,
        division: {
          id: division.id,
          name: division.name,
          league: { id: division.league.id, name: division.league.name, sport: division.league.sport },
        },
        summary: {
          totalFixtures: fixtures.length,
          totalBookings: fixtures.reduce((sum, f) => sum + (f.bookings?.length || 0), 0),
        },
        fixtures: fixtureDetails,
      });
    } catch (error) {
      console.error("diagnosticDivisionFixtures error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  };

  // Full data chain analysis
  exports.diagnosticFullChain = async (req, res) => {
    try {
      const { divisionId } = req.params;
      const { userId } = req.user;

      console.log("\n=== FULL DATA CHAIN ANALYSIS ===");
      console.log(`Division ID: ${divisionId}`);
      console.log(`User ID: ${userId}\n`);

      // Step 1: Get division
      console.log("STEP 1: Finding Division...");
      const division = await Division.findByPk(divisionId);
      console.log(`  Division found: ${division ? division.name : "NOT FOUND"}`);
      if (!division) {
        return res.status(404).json({ success: false, error: "Division not found" });
      }

      // Step 2: Get fixtures
      console.log("\nSTEP 2: Finding Fixtures in Division...");
      const fixtures = await Fixture.findAll({ where: { divisionId } });
      console.log(`  Fixtures found: ${fixtures.length}`);
      console.log(`  Fixture IDs: ${fixtures.map(f => f.id).join(", ")}`);

      // Step 3: Get bookings
      console.log("\nSTEP 3: Finding Bookings for these Fixtures...");
      const fixtureIds = fixtures.map(f => f.id);
      let allBookings = [];
      if (fixtureIds.length > 0) {
        allBookings = await Booking.findAll({
          where: { fixtureId: fixtureIds },
        });
      }
      console.log(`  Total Bookings: ${allBookings.length}`);
      console.log(`  Booking statuses: ${allBookings.map(b => b.status).join(", ")}`);
      console.log(`  Booking IDs: ${allBookings.map(b => b.id).join(", ")}`);

      // Step 4: Get match results
      console.log("\nSTEP 4: Finding MatchResults for these Bookings...");
      const bookingIds = allBookings.map(b => b.id);
      let allMatchResults = [];
      if (bookingIds.length > 0) {
        allMatchResults = await MatchResult.findAll({
          where: { bookingId: bookingIds },
        });
      }
      console.log(`  Total MatchResults: ${allMatchResults.length}`);
      console.log(`  MatchResult statuses: ${allMatchResults.map(m => m.resultStatus).join(", ")}`);
      console.log(`  MatchResult IDs: ${allMatchResults.map(m => m.id).join(", ")}`);

      // Step 5: Analyze confirmed bookings with results
      console.log("\nSTEP 5: Analyzing Confirmed Bookings with Results...");
      const confirmedBookings = allBookings.filter(b => b.status === "confirmed");
      console.log(`  Confirmed bookings: ${confirmedBookings.length}`);
      const confirmedWithResults = confirmedBookings.filter(b =>
        allMatchResults.some(m => m.bookingId === b.id)
      );
      console.log(`  Confirmed bookings with results: ${confirmedWithResults.length}`);

      console.log("\n=== END ANALYSIS ===\n");

      res.json({
        success: true,
        division: {
          id: division.id,
          name: division.name,
        },
        chain: {
          step1_division: { found: !!division },
          step2_fixtures: { count: fixtures.length, ids: fixtures.map(f => f.id) },
          step3_bookings: {
            count: allBookings.length,
            confirmed: allBookings.filter(b => b.status === "confirmed").length,
            pending: allBookings.filter(b => b.status === "pending").length,
            cancelled: allBookings.filter(b => b.status === "cancelled").length,
            completed: allBookings.filter(b => b.status === "completed").length,
            ids: allBookings.map(b => ({ id: b.id, status: b.status })),
          },
          step4_matchResults: {
            count: allMatchResults.length,
            ids: allMatchResults.map(m => ({ id: m.id, bookingId: m.bookingId, status: m.resultStatus })),
          },
          step5_complete_matches: {
            count: confirmedWithResults.length,
            details: confirmedWithResults.map(b => ({
              bookingId: b.id,
              matchResult: allMatchResults.find(m => m.bookingId === b.id),
            })),
          },
        },
      });
    } catch (error) {
      console.error("diagnosticFullChain error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  };

  // ============================================
  // GET PENDING WALKOVERS FOR LEAGUE
  // ============================================
  exports.getPendingWalkoversForLeague = async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { userId } = req.user;

      // Verify league exists and user has access
      const league = await League.findByPk(leagueId);
      if (!league) {
        return res.status(404).json({ success: false, error: "League not found" });
      }

      // Check if user is organization admin (owner of this league)
      const organization = await Organization.findOne({ where: { userId } });
      if (!organization || organization.id !== league.organizationId) {
        return res.status(403).json({ success: false, error: "Unauthorized: You don't manage this league" });
      }

      // Fetch all pending walkovers (status = 'Pending' or 'Awaiting Admin Approval') for this league
      console.log(`[getPendingWalkoversForLeague] Fetching walkovers for league ${leagueId}`);
      const pendingWalkovers = await MatchResult.findAll({
        where: {
          leagueId,
          resultStatus: { [Op.in]: ['Pending', 'Awaiting Admin Approval'] },
          isWalkover: true,
        },
        include: [
          {
            model: League,
            as: "league",
            attributes: ["id", "matchRules"],
          },
          {
            model: Booking,
            as: "booking",
            attributes: ["id", "playerId", "opponentId"],
          },
          {
            model: Player,
            as: "player1",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: Player,
            as: "player2",
            attributes: ["id", "name", "nickname"],
          },
          {
            model: Player,
            as: "submitter",
            attributes: ["id", "name", "nickname"],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Format response
      const formatted = pendingWalkovers.map(walkover => {
        let walkoverScore = null;

        // First check top-level walkoverScore field (set by admin approval)
        if (walkover.walkoverScore) {
          walkoverScore = walkover.walkoverScore;
        }

        // Then check resultData (set at submission time)
        const resultData = walkover.resultData || {};
        if (!walkoverScore) {
          if (typeof resultData === 'string') {
            try { walkoverScore = JSON.parse(resultData)?.walkoverScore || null; } catch (e) { walkoverScore = null; }
          } else {
            walkoverScore = resultData?.walkoverScore || null;
          }
        }

        if (!walkoverScore) {
          // Default to league walkover rules (or fall back to bestOf when not configured)
          let matchRules = walkover.league?.matchRules || {};
          if (typeof matchRules === 'string') {
            try { matchRules = JSON.parse(matchRules); } catch (e) { matchRules = {}; }
          }

          const walkoverRule = matchRules.walkover?.rule || null;
          const customWalkover = matchRules.walkover?.customScore || null;
          let winScore = null;
          let loseScore = 0;

          if (walkoverRule === 'autoBestOf') {
            let totalFrames = 5;
            if (matchRules.bestOf === 'custom') {
              totalFrames = parseInt(matchRules.customFrames) || 1;
            } else if (matchRules.bestOf) {
              totalFrames = parseInt(matchRules.bestOf) || 1;
            } else {
              const matchFormatStr = walkover.league?.matchFormat || "Best of 5";
              const m = matchFormatStr.match(/\d+/);
              totalFrames = m ? parseInt(m[0]) : 5;
            }
            winScore = Math.ceil(totalFrames / 2); // Best of 3 → 2, Best of 5 → 3, Best of 7 → 4
          } else if (walkoverRule === 'auto2-0') {
            winScore = 2;
          } else if (walkoverRule === 'auto5-0') {
            winScore = 5;
          } else if (walkoverRule === 'custom' && customWalkover) {
            const parsed = String(customWalkover).split('-').map(Number);
            if (parsed.length === 2 && !Number.isNaN(parsed[0]) && !Number.isNaN(parsed[1])) {
              winScore = parsed[0];
              loseScore = parsed[1];
            }
          }

          if (winScore === null) {
            let totalFrames = 5;
            if (matchRules.bestOf === 'custom') {
              totalFrames = parseInt(matchRules.customFrames) || 5;
            } else if (matchRules.bestOf) {
              totalFrames = parseInt(matchRules.bestOf) || 5;
            } else {
              const matchFormatStr = walkover.league?.matchFormat || "Best of 5";
              const m = matchFormatStr.match(/\d+/);
              totalFrames = m ? parseInt(m[0]) : 5;
            }
            winScore = totalFrames;
          }

          const winnerId = walkover.winnerId || walkover.walkoverWinner;
          const p1Id = walkover.player1Id || (walkover.player1?.id);

          if (winnerId && p1Id && winnerId.toString() === p1Id.toString()) {
            walkoverScore = `${winScore}-${loseScore}`;
          } else {
            walkoverScore = `${loseScore}-${winScore}`;
          }
        }

        return {
          id: walkover.id,
          bookingId: walkover.bookingId,
          leagueId: walkover.leagueId,
          status: walkover.resultStatus,
          isWalkover: walkover.isWalkover,
          walkoverReason: walkover.walkoverReason,
          notes: walkover.notes,
          submittedAt: walkover.createdAt,
          submittedByName: walkover.submitter?.name || "Unknown",
          submittedById: walkover.submittedBy,
          walkoverWinner: walkover.winnerId,
          player1: {
            id: walkover.player1?.id,
            name: walkover.player1?.name,
            nickname: walkover.player1?.nickname,
          },
          player2: {
            id: walkover.player2?.id,
            name: walkover.player2?.name,
            nickname: walkover.player2?.nickname,
          },
          walkoverScore,
        };
      });

      res.json({
        success: true,
        data: formatted,
        message: "Pending walkovers retrieved successfully",
      });
    } catch (error) {
      console.error("[getPendingWalkoversForLeague] Error:", {
        message: error.message,
        stack: error.stack,
        leagueId: req.params.leagueId,
      });
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  module.exports = exports;
