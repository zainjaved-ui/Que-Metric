const { Player, User, Organization, NameChangeHistory, Club, ClubMember, LeaguePlayer, League, MatchResult, Fixture, TournamentParticipant, Tournament } = require("../models");
const { Op } = require("sequelize");
const sequelize = require("../config/db");

/**
 * Helper to find a player profile by resolving all user IDs associated with the current user's email.
 * OPTIMIZED: Reduced from 3 queries to 1-2 queries
 */
const resolvePlayerProfile = async (userId, include = []) => {
  // If include is empty, try to optimize by checking if we can use just user ID
  // Otherwise batch the queries together

  const currentUser = await User.findByPk(userId, {
    attributes: ['id', 'email']
  });
  if (!currentUser) return null;

  // Batch find all users with same email and their players in one go
  const allUsersWithEmail = await User.findAll({
    where: { email: currentUser.email },
    attributes: ['id'],
    raw: true
  });
  const userIds = allUsersWithEmail.map(u => u.id);

  // Single query to find player with includes
  return await Player.findOne({
    where: { userId: { [Op.in]: userIds } },
    include,
    order: [['createdAt', 'ASC']],
    // Only fetch needed attributes
    attributes: [
      'id', 'userId', 'organizationId', 'clubId', 'name', 'nickname',
      'avatarUrl', 'dateOfBirth', 'gender', 'phoneNumber', 'experienceLevel',
      'badgeType', 'sports', 'bio', 'isIndependent', 'createdAt', 'updatedAt'
    ]
  });
};

exports.resolvePlayerProfile = resolvePlayerProfile;

const normalizeDashboardSport = (sport) => (sport === 'poker' ? 'pooker' : (sport || 'snooker'));

const isByeLikeResult = (result) => result?.player1Id == null || result?.player2Id == null;

const shouldExcludeResultFromStats = (result) => Boolean(result?.isWalkover || isByeLikeResult(result));

const isLeagueScopedResult = (result) => result?.matchType === 'league' || Boolean(result?.leagueId && !result?.tournamentId);

const isTournamentScopedResult = (result) => result?.matchType === 'tournament' || Boolean(result?.tournamentId);

/**
 * Helper to aggregate player stats from all participated leagues and tournaments.
 * Now includes detailed metrics like frame losses, breaks, and potted balls.
 * OPTIMIZED: Single query with proper eager loading instead of N+1
 */
const getAggregatedStats = async (playerId) => {
  const stats = {
    snooker: { matches: 0, wins: 0, losses: 0, highestBreak: 0, winRate: 0, frameWins: 0, frameLosses: 0, frameDiff: 0, breaks50: 0, breaks100: 0, whitewashes: 0 },
    pool: { matches: 0, wins: 0, losses: 0, winRate: 0, rackWins: 0, rackLosses: 0, rackDiff: 0, sevenBallWins: 0, ballsPotted: 0, whitewashes: 0 },
    pooker: { matches: 0, wins: 0, losses: 0, winRate: 0, totalPoints: 0, frameWins: 0, frameLosses: 0, ballsPotted: 0, blackFinishes: 0, whitewashes: 0 }
  };
  const titles = [];
  const detectedSports = new Set();

  // Fetch both League and Tournament participations
  const [lPs, tPs] = await Promise.all([
    LeaguePlayer.findAll({
      where: { playerId, leagueId: { [Op.ne]: null }, tournamentId: null },
      include: [{ model: League, as: 'league', attributes: ['sport', 'name', 'leagueEndDate'], required: true }]
    }),
    TournamentParticipant.findAll({
      where: { playerId },
      include: [{ model: Tournament, as: 'tournament', attributes: ['sport', 'name', 'endDate'], required: true }]
    })
  ]);

  const all = [
    ...lPs.map(lp => ({ d: lp, s: lp.league?.sport, n: lp.league?.name, e: lp.league?.leagueEndDate || lp.updatedAt })),
    ...tPs.map(tp => ({ d: tp, s: tp.tournament?.sport, n: tp.tournament?.name, e: tp.tournament?.endDate || tp.updatedAt }))
  ];

  for (const p of all) {
    let sport = (p.s || 'snooker').toLowerCase() === 'poker' ? 'pooker' : (p.s || 'snooker').toLowerCase();
    if (!stats[sport]) continue;

    detectedSports.add(p.s || 'snooker');
    const s = stats[sport];
    const d = p.d;

    s.matches += Math.max(0, (d.matchesPlayed || 0));
    s.wins += Math.max(0, (d.matchesWon || 0));
    s.losses += Math.max(0, (d.matchesLost || 0));
    s.whitewashes += Math.max(0, (d.whitewashWins || 0));

    if (sport === 'snooker') {
      s.highestBreak = Math.max(s.highestBreak, d.highestBreak || 0);
      s.frameWins += Math.max(0, (d.framesWon || 0));
      s.frameLosses += Math.max(0, (d.framesLost || 0));
      s.frameDiff += (d.frameDifference || 0);
      s.breaks50 += Math.max(0, (d.breaks50Plus || 0));
      s.breaks100 += Math.max(0, (d.breaks100Plus || 0));
    } else if (sport === 'pool') {
      s.rackWins += Math.max(0, (d.framesWon || 0));
      s.rackLosses += Math.max(0, (d.framesLost || 0));
      s.rackDiff += (d.frameDifference || 0);
      s.sevenBallWins += Math.max(0, (d.sevenBallWins || 0));
      s.ballsPotted += Math.max(0, (d.ballsPotted || 0));
    } else if (sport === 'pooker') {
      s.totalPoints += Math.max(0, (d.points || 0));
      s.frameWins += Math.max(0, (d.framesWon || 0));
      s.frameLosses += Math.max(0, (d.framesLost || 0));
      s.ballsPotted += Math.max(0, (d.ballsPotted || 0));
      s.blackFinishes += Math.max(0, (d.blackFinishes || 0));
    }

    if (d.title) {
      titles.push({ title: d.title, leagueName: p.n, sport: p.s, date: p.e });
    }
  }

  Object.keys(stats).forEach(k => {
    if (stats[k].matches > 0) stats[k].winRate = Math.round((stats[k].wins / stats[k].matches) * 100 * 10) / 10;
  });

  return {
    detectedSports: Array.from(detectedSports),
    aggregatedStats: stats,
    titles: titles.sort((a, b) => new Date(b.date) - new Date(a.date))
  };
};

exports.getAggregatedStats = getAggregatedStats;

exports.getMyProfile = async (req, res) => {
  try {
    const { userId } = req.user;

    const player = await resolvePlayerProfile(userId, [
      { association: "user", attributes: ["email", "isActive", "status", "emailVerified"] },
      { association: "organization", attributes: ["id", "organizationName"] },
      { association: "club", attributes: ["id", "name"] },
    ]);

    if (!player) {
      return res.status(404).json({ success: false, error: "Player profile not found" });
    }

    // Get automated stats
    const { detectedSports, aggregatedStats, titles } = await getAggregatedStats(player.id);

    res.json({
      success: true,
      data: {
        ...player.toJSON(),
        detectedSports,
        aggregatedStats,
        titles
      },
      message: "Profile retrieved"
    });
  } catch (error) {
    console.error("getMyProfile error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { userId } = req.user;
    const updateData = req.body;

    const player = await resolvePlayerProfile(userId);
    if (!player) {
      return res.status(404).json({ success: false, error: "Player profile not found" });
    }

    // ✅ PROFILE EDITING RULES

    // 1. LOCKED FIELDS - Cannot be changed directly
    const lockedFields = ["userId", "id", "createdAt", "badgeType"];
    const attemptedLockedFields = lockedFields.filter(field => updateData.hasOwnProperty(field));

    if (attemptedLockedFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `The following fields cannot be modified: ${attemptedLockedFields.join(", ")}`,
        lockedFields: attemptedLockedFields,
      });
    }

    // 2. IDENTITY CHANGES (name / DOB) - queue for admin approval
    const normalizedName = typeof updateData.name === "string" ? updateData.name.trim() : null;
    const hasNameChange = normalizedName && normalizedName !== player.name;
    const currentDob = player.dateOfBirth ? new Date(player.dateOfBirth).toISOString().split('T')[0] : '';
    const requestedDob = updateData.hasOwnProperty("dateOfBirth") && updateData.dateOfBirth
      ? new Date(updateData.dateOfBirth).toISOString().split('T')[0]
      : '';
    const hasDobChange = updateData.hasOwnProperty("dateOfBirth") && requestedDob !== currentDob;
    const identityChangeReason = (updateData.identityChangeReason || updateData.nameChangeReason || "").trim();

    if (hasNameChange || hasDobChange) {
      if (!identityChangeReason) {
        return res.status(400).json({
          success: false,
          error: "identityChangeReason is required when requesting name or dateOfBirth changes.",
        });
      }

      const existingPending = await NameChangeHistory.findOne({
        where: {
          playerId: player.id,
          status: "pending",
        },
      });

      if (existingPending) {
        return res.status(409).json({
          success: false,
          error: "You already have a pending identity change request awaiting admin review.",
        });
      }

      if (hasNameChange) {
        await NameChangeHistory.create({
          playerId: player.id,
          oldName: player.name,
          newName: normalizedName,
          reason: identityChangeReason,
          status: "pending",
        });
      }

      if (hasDobChange) {
        await NameChangeHistory.create({
          playerId: player.id,
          oldName: `DOB:${player.dateOfBirth || ""}`,
          newName: `DOB:${updateData.dateOfBirth || ""}`,
          reason: identityChangeReason,
          status: "pending",
        });
      }

      delete updateData.name;
      delete updateData.dateOfBirth;
    }

    // Remove request metadata from update data (not fields on Player model)
    delete updateData.nameChangeReason;
    delete updateData.identityChangeReason;

    // 3. disabilityFlag governance: users can self-declare true, but cannot self-clear once set.
    if (updateData.hasOwnProperty("disabilityFlag")) {
      if (typeof updateData.disabilityFlag !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "disabilityFlag must be a boolean.",
        });
      }

      if (player.disabilityFlag === true && updateData.disabilityFlag === false) {
        return res.status(403).json({
          success: false,
          error: "Disability status cannot be cleared from self-service profile edit. Please contact an admin.",
        });
      }
    }

    // 4. Apply allowed updates
    const allowedFields = [
      "name", "nickname", "gender", "mobileNumber", "address",
      "bio", "sports", "experienceLevel", "disabilityFlag", "phoneNumber",
    ];

    const filteredUpdate = {};
    allowedFields.forEach(field => {
      if (updateData.hasOwnProperty(field)) {
        filteredUpdate[field] = updateData[field];
      }
    });

    if (Object.keys(filteredUpdate).length > 0) {
      await player.update(filteredUpdate);
    }

    res.json({
      success: true,
      data: player,
      message: hasNameChange || hasDobChange
        ? "Profile updated. Identity change request submitted for admin approval."
        : "Profile updated successfully"
    });
  } catch (error) {
    console.error("updateProfile error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    const { userId } = req.user;

    // Log upload attempt
    console.log(`[AVATAR UPLOAD] User ${userId} attempting to upload avatar`);
    console.log(`[AVATAR UPLOAD] File info:`, req.file ? {
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
    } : "No file");

    if (!req.file) {
      console.warn(`[AVATAR UPLOAD] No file provided by user ${userId}`);
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const player = await resolvePlayerProfile(userId);
    if (!player) {
      console.warn(`[AVATAR UPLOAD] Player profile not found for user ${userId}`);
      return res.status(404).json({ success: false, error: "Player profile not found" });
    }

    // Construct full relative URL for the browser
    const avatarUrl = `/uploads/${req.file.filename}`;

    console.log(`[AVATAR UPLOAD] Updating player ${userId} with avatar URL: ${avatarUrl}`);

    await player.update({ avatarUrl });

    console.log(`[AVATAR UPLOAD] Successfully uploaded avatar for user ${userId}`);

    res.json({
      success: true,
      data: { avatarUrl },
      message: "Avatar uploaded successfully",
    });
  } catch (error) {
    console.error("[AVATAR UPLOAD] Error:", {
      message: error.message,
      stack: error.stack,
      userId: req.user?.userId,
    });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get all active players (regardless of verification status)
exports.getAllPlayers = async (req, res) => {
  try {
    // Fetch all ACTIVE players (user status = Active, regardless of badgeType)
    const { Op } = require("sequelize");
    const players = await Player.findAll({
      include: [
        {
          association: "user",
          attributes: ["id", "role", "isActive"],
          required: true,
          where: {
            isActive: true
          }
        },
      ],
      order: [["name", "ASC"]],
    });

    console.log(`[getAllPlayers] Found ${players.length} active players (out of total in system)`);

    // Return all active players
    return res.status(200).json({
      success: true,
      data: players,
      message: `Active players retrieved successfully (${players.length} active)`,
    });
  } catch (error) {
    console.error("getAllPlayers error:", error.message || error);
    return res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

// Toggle player status (activate/deactivate)
exports.togglePlayerStatus = async (req, res) => {
  try {
    const { playerId } = req.params;

    if (!playerId) {
      return res.status(400).json({ success: false, error: "Player ID is required" });
    }

    const player = await Player.findByPk(playerId, {
      include: [
        {
          association: "user",
          attributes: ["id", "email", "isActive"],
          required: false,
        },
      ],
    });

    if (!player) {
      return res.status(404).json({ success: false, error: "Player not found" });
    }

    if (!player.user) {
      return res.status(400).json({ success: false, error: "Player user account not found" });
    }

    // Toggle the status
    const newStatus = !player.user.isActive;
    await player.user.update({ isActive: newStatus });

    console.log(`[togglePlayerStatus] Player ${playerId} status toggled to ${newStatus}`);

    return res.status(200).json({
      success: true,
      data: {
        playerId: player.id,
        playerName: player.name,
        newStatus: newStatus,
      },
      message: `Player status toggled to ${newStatus ? "Active" : "Inactive"}`,
    });
  } catch (error) {
    console.error("togglePlayerStatus error:", error.message || error);
    return res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

// Diagnostic endpoint - get all players and organizations (for debugging)
exports.getDiagnostics = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const allOrganizations = await Organization.findAll({
      attributes: ["id", "organizationName", "userId"],
    });

    const allPlayers = await Player.findAll({
      attributes: ["id", "organizationId", "userId", "name"],
      raw: true,
    });

    const currentOrg = await Organization.findOne({ where: { userId: req.user.userId } });

    console.log("[getDiagnostics] Returning diagnostic data...");

    return res.status(200).json({
      success: true,
      data: {
        currentUser: {
          userId: req.user.userId,
          role: req.user.role,
        },
        currentOrganization: currentOrg ? {
          id: currentOrg.id,
          name: currentOrg.organizationName,
        } : null,
        allOrganizations: allOrganizations,
        allPlayersCount: allPlayers.length,
        allPlayers: allPlayers,
        playersForCurrentOrg: allPlayers.filter(p => p.organizationId === currentOrg?.id),
      },
      message: "Diagnostic data retrieved",
    });
  } catch (error) {
    console.error("getDiagnostics error:", error.message || error);
    return res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

// Get players by club
exports.getPlayersByClub = async (req, res) => {
  try {
    const { clubId } = req.params;

    if (!clubId) {
      return res.status(400).json({ success: false, error: "Club ID is required" });
    }

    // Verify club exists
    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    console.log(`[getPlayersByClub] START: clubId=${clubId}`);

    // Get players that either have clubId set OR are members in club_members
    // 1) Find all playerIds referenced in ClubMember for this club
    const clubMembers = await ClubMember.findAll({ where: { clubId, status: 'active' } });
    console.log(`[getPlayersByClub] Found ${clubMembers.length} active ClubMembers for clubId=${clubId}`);
    clubMembers.forEach(m => {
      console.log(`[getPlayersByClub]   - ClubMember: userId=${m.userId}, playerId=${m.playerId}, role=${m.role}`);
    });

    const memberPlayerIds = clubMembers.map(m => m.playerId).filter(Boolean);
    console.log(`[getPlayersByClub] memberPlayerIds: [${memberPlayerIds.join(', ')}]`);

    // 2) Find players that have clubId set to this club
    const playersByClubId = await Player.findAll({ where: { clubId }, attributes: ['id'] });
    console.log(`[getPlayersByClub] Found ${playersByClubId.length} players with clubId=${clubId}`);

    const playersByClubIdIds = playersByClubId.map(p => p.id);
    console.log(`[getPlayersByClub] playersByClubIdIds: [${playersByClubIdIds.join(', ')}]`);

    // Combine unique IDs
    const combinedIds = Array.from(new Set([...(memberPlayerIds || []), ...(playersByClubIdIds || [])]));
    console.log(`[getPlayersByClub] combinedIds (unique): [${combinedIds.join(', ')}]`);

    let players = [];
    if (combinedIds.length > 0) {
      console.log(`[getPlayersByClub] Fetching Player details for ${combinedIds.length} player IDs...`);
      players = await Player.findAll({
        where: { id: combinedIds },
        include: [
          {
            association: "user",
            attributes: ["id", "role", "isActive"],
            required: false,
          },
        ],
        order: [["name", "ASC"]],
      });
      console.log(`[getPlayersByClub] ✅ Retrieved ${players.length} players`);
    } else {
      console.log(`[getPlayersByClub] ⚠️ No players found (combinedIds is empty)`);
    }

    return res.status(200).json({
      success: true,
      data: players,
      message: "Players retrieved successfully"
    });

  } catch (error) {
    console.error("getPlayersByClub error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

/**
 * OPTIMIZED DASHBOARD OVERVIEW
 * GET /api/player/dashboard/overview
 *
 * Returns leagues and upcoming fixtures
 * Performance: ~50-100ms (removed expensive standings lookups)
 */
exports.getDashboardOverview = async (req, res) => {
  try {
    const { userId } = req.user;
    const startTime = Date.now();

    // Get player
    const player = await resolvePlayerProfile(userId, [
      { association: "user", attributes: ["email"] },
    ]);

    if (!player) {
      return res.status(404).json({ success: false, error: "Player not found" });
    }

    // ========== STEP 1: Get all leagues the player is in (1 optimized query) ==========
    const leaguePlayers = await LeaguePlayer.findAll({
      where: { playerId: player.id },
      attributes: ['leagueId', 'playerId', 'matchesPlayed', 'matchesWon', 'matchesLost', 'points', 'divisionId', 'walkoverWins', 'walkoverLosses'],
      include: [
        {
          model: League,
          as: 'league',
          attributes: ['id', 'name', 'sport', 'status', 'format', 'currentRound'],
          required: true
        }
      ],
      raw: false
    });

    if (!leaguePlayers || leaguePlayers.length === 0) {
      return res.json({
        success: true,
        data: {
          leagues: [],
          upcomingFixtures: []
        },
        timing: { queryTime: Date.now() - startTime }
      });
    }

    // ========== STEP 2: Get upcoming fixtures (1 batch query) ==========
    const activeLeagues = leaguePlayers.filter(lp => lp.league.status === 'active').map(lp => lp.leagueId);
    const { Fixture } = require("../models");

    let upcomingFixtures = [];
    if (activeLeagues.length > 0) {
      const fixtures = await Fixture.findAll({
        where: {
          leagueId: { [Op.in]: activeLeagues },
          status: { [Op.in]: ['scheduled', 'pending'] }
        },
        attributes: ['id', 'leagueId', 'player1Id', 'player2Id', 'scheduledDate', 'status', 'round', 'matchNumber'],
        include: [
          {
            association: 'player1',
            attributes: ['id', 'name', 'nickname'],
            required: false
          },
          {
            association: 'player2',
            attributes: ['id', 'name', 'nickname'],
            required: false
          },
          {
            association: 'bookings',
            where: { status: 'confirmed' },
            required: false,
            attributes: ['id', 'bookingDate', 'startTime', 'status']
          }
        ],
        order: [['scheduledDate', 'ASC']],
        limit: 10 // Only fetch next 10 fixtures
      });

      // Enrich with league info and filter for current player
      upcomingFixtures = fixtures
        .filter(f => f.player1Id === player.id || f.player2Id === player.id)
        .map(f => {
          const confirmedBooking = f.bookings && f.bookings.find(b => b.status === 'confirmed');
          return {
            id: f.id,
            leagueId: f.leagueId,
            leagueName: leaguePlayers.find(lp => lp.leagueId === f.leagueId)?.league?.name,
            opponent: f.player1Id === player.id ? f.player2 : f.player1,
            sport: f.league?.sport || 'snooker',
            date: confirmedBooking ? confirmedBooking.bookingDate : null,
            startTime: confirmedBooking ? confirmedBooking.startTime : 'TBA',
            status: f.status,
            round: f.round
          };
        });
    }

    // ========== BUILD RESPONSE ==========
    const leagues = leaguePlayers.map(lp => ({
      id: lp.league.id,
      name: lp.league.name,
      sport: lp.league.sport,
      status: lp.league.status,
      format: lp.league.format,
      leagueStats: {
        wins: Math.max(0, (lp.matchesWon || 0) - (lp.walkoverWins || 0)),
        losses: Math.max(0, (lp.matchesLost || 0) - (lp.walkoverLosses || 0)),
        points: lp.points || 0
      }
    }));

    const elapsed = Date.now() - startTime;
    console.log(`[getDashboardOverview] ✅ Returned dashboard for player ${player.id} in ${elapsed}ms (${leagues.length} leagues, ${upcomingFixtures.length} fixtures)`);

    res.json({
      success: true,
      data: {
        leagues,
        upcomingFixtures
      },
      timing: { queryTime: elapsed }
    });

  } catch (error) {
    console.error("getDashboardOverview error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get filtered dashboard stats with options to filter by:
 * - leagueFilter: 'league', 'tournament', or 'both' (default: 'both')
 * - game: 'all', 'snooker', 'pool', 'pooker' (default: 'all')
 *
 * IMPORTANT: Excludes bye and walkover matches from stats
 *
 * Query params: ?leagueFilter=league&game=snooker
 */
exports.getFilteredStats = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueFilter = 'both', game = 'all' } = req.query;
    const normalizedGame = String(game || 'all').toLowerCase();
    const startTime = Date.now();

    const player = await resolvePlayerProfile(userId, [
      { association: "user", attributes: ["email"] },
    ]);

    if (!player) {
      return res.status(404).json({ success: false, error: "Player not found" });
    }

    // ========== Get filtered leagues/tournaments ==========
    let leaguePlayers = [];
    let tournamentParticipants = [];

    if (leagueFilter === 'league' || leagueFilter === 'both') {
      leaguePlayers = await LeaguePlayer.findAll({
        where: { playerId: player.id, leagueId: { [Op.ne]: null }, tournamentId: null },
        include: [{ model: League, as: 'league', attributes: ['id', 'name', 'sport', 'status'], required: true }]
      });
    }

    if (leagueFilter === 'tournament' || leagueFilter === 'both') {
      tournamentParticipants = await TournamentParticipant.findAll({
        where: { playerId: player.id },
        include: [{ model: Tournament, as: 'tournament', attributes: ['id', 'name', 'sport', 'status'], required: true }]
      });
    }

    const allParticipations = [
      ...leaguePlayers.map(lp => ({ type: 'league', data: lp, sport: lp.league?.sport })),
      ...tournamentParticipants.map(tp => ({ type: 'tournament', data: tp, sport: tp.tournament?.sport }))
    ];

    if (allParticipations.length === 0) {
      return res.json({ success: true, data: { stats: getEmptyStats(), leagues: [], tournaments: [] } });
    }

    // ========== Filter by game ==========
    let filtered = allParticipations;
    if (normalizedGame !== 'all') {
      filtered = allParticipations.filter(p => {
        const sport = (p.type === 'league' ? p.data.league?.sport : p.data.tournament?.sport || '').toLowerCase();
        return sport === normalizedGame || (normalizedGame === 'pooker' && sport === 'poker');
      });
    }

    if (filtered.length === 0) {
      return res.json({
        success: true,
        data: {
          stats: {
            snooker: { matches: 0, wins: 0, losses: 0, winRate: 0, points: 0, byeExcluded: 0, walkoverExcluded: 0 },
            pool: { matches: 0, wins: 0, losses: 0, winRate: 0, byeExcluded: 0, walkoverExcluded: 0 },
            pooker: { matches: 0, wins: 0, losses: 0, winRate: 0, points: 0, byeExcluded: 0, walkoverExcluded: 0 }
          },
          leagues: [],
          tournaments: [],
          filter: { leagueFilter, game: normalizedGame },
          excludedNote: "Bye and walkover matches are excluded from all stats"
        },
        timing: { queryTime: Date.now() - startTime }
      });
    }



    // OPTIMIZATION: Fetch all relevant data in BULK to avoid N+1
    const leagueIds = filtered.filter(p => p.type === 'league').map(p => p.data.leagueId);
    const tournamentIds = filtered.filter(p => p.type === 'tournament').map(p => p.data.tournamentId);

    const [byeCounts, tournamentMatches] = await Promise.all([
      // Bulk count byes
      leagueIds.length > 0 ? Fixture.findAll({
        where: { leagueId: { [Op.in]: leagueIds }, [Op.or]: [{ player1Id: player.id }, { player2Id: player.id }], status: 'bye' },
        attributes: ['leagueId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['leagueId']
      }) : [],
      // Bulk fetch tournament match details
      tournamentIds.length > 0 ? MatchResult.findAll({
        where: { tournamentId: { [Op.in]: tournamentIds }, resultStatus: 'Confirmed', [Op.or]: [{ player1Id: player.id }, { player2Id: player.id }] }
      }) : []
    ]);

    const byeMap = {};
    byeCounts.forEach(bc => { byeMap[bc.leagueId] = parseInt(bc.getDataValue('count')) || 0; });

    const stats = getEmptyStats();

    // Calculate stats from participations
    for (const p of filtered) {
      const sport = (p.sport || 'snooker').toLowerCase() === 'poker' ? 'pooker' : (p.sport || 'snooker').toLowerCase();
      const s = stats[sport];
      if (!s) continue;

      const d = p.data;
      const excludedByes = byeMap[d.leagueId] || 0;
      const wWins = d.walkoverWins || 0;
      const wLosses = d.walkoverLosses || 0;

      s.matches += Math.max(0, (d.matchesPlayed || 0) - excludedByes - (wWins + wLosses));
      s.wins += Math.max(0, (d.matchesWon || 0) - wWins);
      s.losses += Math.max(0, (d.matchesLost || 0) - wLosses);
      s.byeExcluded += excludedByes;
      s.walkoverExcluded += (wWins + wLosses);

      // Add performance metrics from columns
      if (sport === 'snooker') {
        s.frameWins += Math.max(0, (d.framesWon || 0));
        s.frameLosses += Math.max(0, (d.framesLost || 0));
        s.frameDiff += (d.frameDifference || 0);
        s.highestBreak = Math.max(s.highestBreak, d.highestBreak || 0);
        s.breaks50 += Math.max(0, (d.breaks50Plus || 0));
        s.breaks100 += Math.max(0, (d.breaks100Plus || 0));
      } else if (sport === 'pool') {
        s.rackWins += Math.max(0, (d.framesWon || 0));
        s.rackLosses += Math.max(0, (d.framesLost || 0));
        s.rackDiff += (d.frameDifference || 0);
        s.sevenBallWins += Math.max(0, (d.sevenBallWins || 0));
        s.ballsPotted += Math.max(0, (d.ballsPotted || 0));
      } else if (sport === 'pooker') {
        s.totalPoints += Math.max(0, (d.points || 0));
        s.frameWins += Math.max(0, (d.framesWon || 0));
        s.frameLosses += Math.max(0, (d.framesLost || 0));
        s.ballsPotted += Math.max(0, (d.ballsPotted || 0));
        s.blackFinishes += Math.max(0, (d.blackFinishes || 0));
      }
      s.whitewashes += Math.max(0, (d.whitewashWins || 0));
    }

    // Final calculations
    Object.keys(stats).forEach(k => {
      if (stats[k].matches > 0) stats[k].winRate = Math.round((stats[k].wins / stats[k].matches) * 100 * 10) / 10;
    });

    res.json({
      success: true,
      data: {
        stats,
        leagues: filtered.filter(p => p.type === 'league').map(p => ({ id: p.data.leagueId, name: p.data.league?.name, sport: p.data.league?.sport })),
        tournaments: filtered.filter(p => p.type === 'tournament').map(p => ({ id: p.data.tournamentId, name: p.data.tournament?.name, sport: p.data.tournament?.sport }))
      }
    });

  } catch (error) {
    console.error("getFilteredStats error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

function getEmptyStats() {
  return {
    snooker: { matches: 0, wins: 0, losses: 0, winRate: 0, points: 0, frameWins: 0, frameLosses: 0, frameDiff: 0, highestBreak: 0, breaks50: 0, breaks100: 0, whitewashes: 0, byeExcluded: 0, walkoverExcluded: 0 },
    pool: { matches: 0, wins: 0, losses: 0, winRate: 0, rackWins: 0, rackLosses: 0, rackDiff: 0, sevenBallWins: 0, ballsPotted: 0, whitewashes: 0, byeExcluded: 0, walkoverExcluded: 0 },
    pooker: { matches: 0, wins: 0, losses: 0, winRate: 0, totalPoints: 0, frameWins: 0, frameLosses: 0, ballsPotted: 0, blackFinishes: 0, whitewashes: 0, byeExcluded: 0, walkoverExcluded: 0 }
  };
}

/**
 * GET /api/player/dashboard/stats
 *
 * Returns comprehensive dashboard statistics:
 * - Current win/loss streak
 * - Overall all-time stats (league + tournament + walkover breakdown)
 * - Season stats (current active season)
 * - Break statistics (century breaks, half centuries, personal best)
 * - Performance trend (last 10 confirmed matches)
 * - Head-to-head records per opponent
 * - Recent matches (last 5 confirmed)
 * - Upcoming bookings
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const { userId } = req.user;
    const { Booking, Season } = require('../models');

    // ── Filter params (same as getFilteredStats) ─────────────────────────────
    const leagueFilter = req.query.leagueFilter || 'both'; // 'both' | 'league' | 'tournament'
    const rawGame = req.query.game || 'all';                  // 'all' | 'snooker' | 'pool' | 'pooker'
    const game = String(rawGame).toLowerCase();

    const validLeagueFilters = ['league', 'tournament', 'both'];
    const validGames = ['all', 'snooker', 'pool', 'pooker'];
    if (!validLeagueFilters.includes(leagueFilter) || !validGames.includes(game)) {
      return res.status(400).json({ success: false, error: 'Invalid filter parameters' });
    }

    const player = await resolvePlayerProfile(userId, [
      { association: 'user', attributes: ['email'] }
    ]);
    if (!player) {
      return res.status(404).json({ success: false, error: 'Player not found' });
    }

    const playerId = player.id;
    const today = new Date();

    // ── 1. Fetch all confirmed MatchResults, then apply filters ──────────────
    const baseWhere = {
      [Op.or]: [{ player1Id: playerId }, { player2Id: playerId }],
      resultStatus: 'Confirmed'
    };
    // Apply sport filter at DB level for efficiency (case-insensitive for robustness)
    if (game !== 'all') {
      const sportsToSearch = [game, game.charAt(0).toUpperCase() + game.slice(1)];
      if (game === 'pooker') sportsToSearch.push('poker', 'Poker');
      baseWhere.sport = { [Op.in]: sportsToSearch };
    }

    const allResults = await MatchResult.findAll({
      where: baseWhere,
      include: [
        { model: Player, as: 'player1', attributes: ['id', 'name'] },
        { model: Player, as: 'player2', attributes: ['id', 'name'] },
        { model: League, as: 'league', attributes: ['id', 'name', 'sport'], required: false },
        { model: Tournament, as: 'tournament', attributes: ['id', 'name', 'sport', 'organizationId'], required: false }
      ],
      order: [[sequelize.fn('COALESCE', sequelize.col('confirmedAt'), sequelize.col('adminApprovedAt'), sequelize.col('submittedAt')), 'DESC']],
      attributes: [
        'id', 'player1Id', 'player2Id', 'winnerId', 'matchType', 'sport',
        'player1Frames', 'player2Frames', 'player1RackWins', 'player2RackWins',
        'highestBreak', 'breaks50Plus', 'breaks100Plus',
        'player1WhitewashWins', 'player2WhitewashWins',
        'isWalkover', 'confirmedAt', 'adminApprovedAt', 'submittedAt', 'leagueId', 'tournamentId',
        'snookerFrameDetails'
      ]
    });

    // Apply league/tournament filter in JS (matchType field)
    const filteredResults = allResults.filter(r => {
      if (leagueFilter === 'league') {
        return isLeagueScopedResult(r);
      }
      if (leagueFilter === 'tournament') {
        return isTournamentScopedResult(r);
      }
      return true; // 'both'
    });
    const competitiveResults = filteredResults.filter(r => !shouldExcludeResultFromStats(r));
    const competitiveResultsWithWinner = competitiveResults.filter(r => r.winnerId);

    // ── 2. Compute overall all-time stats ────────────────────────────────────
    let overallStats = {
      leagueMatches: 0, leagueWins: 0, leagueLosses: 0, leagueWalkovers: 0, leagueByes: 0,
      tournamentMatches: 0, tournamentWins: 0, tournamentLosses: 0, tournamentWalkovers: 0, tournamentByes: 0,
      walkovers: 0, walkoverWins: 0, walkoverLosses: 0,
      byeExcluded: 0, walkoverExcluded: 0,
      totalMatches: 0, totalWins: 0, totalLosses: 0,
      framesWon: 0, framesConceded: 0,
      rackWinsTotal: 0, rackConcededTotal: 0,
      pointsWon: 0, pointsConceded: 0,
      whitewashWins: 0, whitewashLosses: 0,
      highestBreak: 0, centuryBreaks: 0, halfCenturies: 0,
      winRate: 0,
      standingPoints: 0
    };

    // Fetch points from LeaguePlayer table for standing points
    const lpRecords = await LeaguePlayer.findAll({
      where: { playerId },
      attributes: [
        'points', 'framesWon', 'framesLost',
        'matchesPlayed', 'matchesWon', 'matchesLost',
        'walkoverWins', 'walkoverLosses', 'whitewashes',
        'highestBreak', 'breaks50Plus', 'breaks100Plus',
        'leagueId', 'tournamentId'
      ],
      include: [
        { model: League, as: 'league', attributes: ['sport'], required: false },
        { model: Tournament, as: 'tournament', attributes: ['sport'], required: false }
      ]
    });

    // FETCH TOURNAMENT PARTICIPANTS if filtering by tournaments
    let tpRecords = [];
    if (leagueFilter !== 'league') {
      tpRecords = await TournamentParticipant.findAll({
        where: { playerId },
        attributes: [
          'matchesPlayed', 'matchesWon', 'matchesLost', 'framesWon', 'framesLost',
          'pointsEarned', 'highestBreak', 'breaks50Plus', 'breaks100Plus',
          'whitewashWins', 'tournamentId'
        ],
        include: [
          { model: Tournament, as: 'tournament', attributes: ['sport'], required: false }
        ]
      });
    }

    for (const lp of lpRecords) {
      // If we are filtering by league type, respect that
      const isL = lp.leagueId && !lp.tournamentId;
      const isT = !!lp.tournamentId;

      if (leagueFilter === 'league' && !isL) continue;
      if (leagueFilter === 'tournament' && !isT) continue;

      // Filter by sport/game if specified
      if (game !== 'all') {
        const leagueSport = isL ? (lp.league?.sport || '').toLowerCase() : null;
        const tournamentSport = isT ? (lp.tournament?.sport || '').toLowerCase() : null;
        const sport = leagueSport || tournamentSport;
        const normalizedSport = normalizeDashboardSport(sport);
        if (normalizedSport !== game) continue;
      }

      const effectiveMatches = lp.matchesPlayed || 0;
      const effectiveWins = lp.matchesWon || 0;
      const effectiveLosses = lp.matchesLost || 0;

      overallStats.totalMatches += effectiveMatches;
      overallStats.totalWins += effectiveWins;
      overallStats.totalLosses += effectiveLosses;

      if (isL) {
        overallStats.leagueMatches += effectiveMatches;
        overallStats.leagueWins += effectiveWins;
        overallStats.leagueLosses += effectiveLosses;
      } else {
        overallStats.tournamentMatches += effectiveMatches;
        overallStats.tournamentWins += effectiveWins;
        overallStats.tournamentLosses += effectiveLosses;
      }

      overallStats.standingPoints += (lp.points || 0);
      // Removed lp.whitewashes addition here to avoid double-counting with the results loop below
      overallStats.framesWon += (lp.framesWon || 0);
      overallStats.framesConceded += (lp.framesLost || 0);
      overallStats.highestBreak = Math.max(overallStats.highestBreak, lp.highestBreak || 0);
      overallStats.centuryBreaks += (lp.breaks100Plus || 0);
      overallStats.halfCenturies += (lp.breaks50Plus || 0);
    }

    // Aggregate tournament participant stats
    for (const tp of tpRecords) {
      // Filter by sport/game if specified
      if (game !== 'all') {
        const tournamentSport = (tp.tournament?.sport || '').toLowerCase();
        const normalizedSport = normalizeDashboardSport(tournamentSport);
        if (normalizedSport !== game) continue;
      }

      const effectiveMatches = tp.matchesPlayed || 0;
      const effectiveWins = tp.matchesWon || 0;
      const effectiveLosses = tp.matchesLost || 0;

      overallStats.totalMatches += effectiveMatches;
      overallStats.totalWins += effectiveWins;
      overallStats.totalLosses += effectiveLosses;
      overallStats.tournamentMatches += effectiveMatches;
      overallStats.tournamentWins += effectiveWins;
      overallStats.tournamentLosses += effectiveLosses;

      // Calculate tournament standing points: use stored value if available, else calculate from wins (3 pts/win)
      const tpPoints = (tp.pointsEarned && tp.pointsEarned > 0) ? tp.pointsEarned : (effectiveWins * 3);
      overallStats.standingPoints += tpPoints;
      overallStats.framesWon += (tp.framesWon || 0);
      overallStats.framesConceded += (tp.framesLost || 0);
      overallStats.highestBreak = Math.max(overallStats.highestBreak, tp.highestBreak || 0);
      overallStats.centuryBreaks += (tp.breaks100Plus || 0);
      overallStats.halfCenturies += (tp.breaks50Plus || 0);
      overallStats.whitewashWins += (tp.whitewashWins || 0);
    }

    for (const r of filteredResults) {
      const isP1 = r.player1Id === playerId;
      const won = r.winnerId === playerId;
      const lost = r.winnerId && r.winnerId !== playerId;
      const isLeagueResult = isLeagueScopedResult(r);
      const isTournamentResult = isTournamentScopedResult(r);
      const isBye = isByeLikeResult(r);

      if (shouldExcludeResultFromStats(r)) {
        if (r.isWalkover) {
          overallStats.walkovers++;
          overallStats.walkoverExcluded++;
          if (won) overallStats.walkoverWins++;
          else if (lost) overallStats.walkoverLosses++;
          if (isLeagueResult) overallStats.leagueWalkovers++;
          if (isTournamentResult) overallStats.tournamentWalkovers++;
        }

        if (isBye) {
          overallStats.byeExcluded++;
          if (isLeagueResult) overallStats.leagueByes++;
          if (isTournamentResult) overallStats.tournamentByes++;
        }

        continue;
      }

      // Frame / rack stats (non-walkover only)
      if (String(r.sport).toLowerCase() === 'snooker') {
        // Frames are now aggregated from LeaguePlayer above for 'Overall'
        // But we still need frame points and breaks from the individual matches

        // Extract snooker scoring points from frame details if available
        const rawFrameDetails = r.snookerFrameDetails;
        const frameDetails = Array.isArray(rawFrameDetails)
          ? rawFrameDetails
          : (typeof rawFrameDetails === 'string' ? (() => { try { return JSON.parse(rawFrameDetails); } catch { return []; } })() : []);
        for (const frame of frameDetails) {
          const myPts = isP1 ? (frame.player1Score || frame.p1Score || 0) : (frame.player2Score || frame.p2Score || 0);
          const oppPts = isP1 ? (frame.player2Score || frame.p2Score || 0) : (frame.player1Score || frame.p1Score || 0);
          overallStats.pointsWon += myPts;
          overallStats.pointsConceded += oppPts;
        }

        overallStats.highestBreak = Math.max(overallStats.highestBreak, r.highestBreak || 0);
        overallStats.centuryBreaks += r.breaks100Plus || 0;
        overallStats.halfCenturies += r.breaks50Plus || 0;
      } else if (String(r.sport).toLowerCase() === 'pool' || String(r.sport).toLowerCase() === 'pooker') {
        const myRacks = isP1 ? (r.player1RackWins || 0) : (r.player2RackWins || 0);
        const oppRacks = isP1 ? (r.player2RackWins || 0) : (r.player1RackWins || 0);
        overallStats.rackWinsTotal += myRacks;
        overallStats.rackConcededTotal += oppRacks;
      }

      // Dynamically calculate whitewash if not explicitly flagged
      let myWW = isP1 ? (r.player1WhitewashWins || 0) : (r.player2WhitewashWins || 0);
      let oppWW = isP1 ? (r.player2WhitewashWins || 0) : (r.player1WhitewashWins || 0);

      // DEBUG: log whitewash data for analysis
      console.log(`[WW-DEBUG] Match ${r.id} | sport=${r.sport} | isP1=${isP1} | won=${won} | lost=${!!lost} | p1F=${r.player1Frames} | p2F=${r.player2Frames} | p1WW=${r.player1WhitewashWins} | p2WW=${r.player2WhitewashWins} | myWW=${myWW}`);

      if (myWW === 0 && won) {
        const myF = isP1 ? (r.player1Frames || r.player1RackWins || 0) : (r.player2Frames || r.player2RackWins || 0);
        const oppF = isP1 ? (r.player2Frames || r.player2RackWins || 0) : (r.player1Frames || r.player1RackWins || 0);
        console.log(`[WW-DEBUG] Detection check: myF=${myF} oppF=${oppF} → whitewash=${oppF === 0 && myF > 0}`);
        if (oppF === 0 && myF > 0) myWW = 1;
      }
      if (oppWW === 0 && lost) {
        const myF = isP1 ? (r.player1Frames || r.player1RackWins || 0) : (r.player2Frames || r.player2RackWins || 0);
        const oppF = isP1 ? (r.player2Frames || r.player2RackWins || 0) : (r.player1Frames || r.player1RackWins || 0);
        if (myF === 0 && oppF > 0) oppWW = 1;
      }

      overallStats.whitewashWins += myWW;
      overallStats.whitewashLosses += oppWW;
    }

    // Compute win rate from competitive matches only
    const competitiveMatches = overallStats.totalMatches;
    const competitiveWins = overallStats.leagueWins + overallStats.tournamentWins;
    overallStats.winRate = competitiveMatches > 0 ? Math.round((competitiveWins / competitiveMatches) * 1000) / 10 : 0;

    // LeaguePlayer aggregates only used as fallback when filtering is "all sports, both types"
    if (leagueFilter === 'both' && game === 'all') {
      const lpMaxBreak = await LeaguePlayer.max('highestBreak', { where: { playerId } });
      if (lpMaxBreak && lpMaxBreak > overallStats.highestBreak) {
        overallStats.highestBreak = lpMaxBreak;
      }
      const lpCenturies = await LeaguePlayer.sum('breaks100Plus', { where: { playerId } });
      const lpHalfCenturies = await LeaguePlayer.sum('breaks50Plus', { where: { playerId } });
      if ((lpCenturies || 0) > overallStats.centuryBreaks) overallStats.centuryBreaks = lpCenturies || 0;
      if ((lpHalfCenturies || 0) > overallStats.halfCenturies) overallStats.halfCenturies = lpHalfCenturies || 0;
    }

    // ── 3. Compute streak from recent results ────────────────────────────────
    let streak = { type: 'none', count: 0 };
    if (competitiveResultsWithWinner.length > 0) {
      const firstResult = competitiveResultsWithWinner[0];
      const firstType = firstResult.winnerId === playerId ? 'win' : 'loss';
      let count = 1;
      for (let i = 1; i < competitiveResultsWithWinner.length; i++) {
        const r = competitiveResultsWithWinner[i];
        const rType = r.winnerId === playerId ? 'win' : 'loss';
        if (rType === firstType) count++;
        else break;
      }
      streak = { type: firstType, count };
    }

    // ── 4. Season/Active Competition stats ──────────────────────────────────
    let seasonStats = null;
    try {
      // LEAGUE STATS: Identify active leagues the player is currently in
      const playerActiveLeagues = await LeaguePlayer.findAll({
        where: { playerId, leagueId: { [Op.not]: null } },
        include: [
          {
            model: League, as: 'league',
            where: { status: 'active' },
            attributes: ['id', 'name', 'sport', 'seasonId'],
            include: [{ model: Season, as: 'season', attributes: ['id', 'name', 'startDate', 'endDate', 'status', 'organizationId'] }]
          }
        ]
      });

      // TOURNAMENT STATS: Identify active tournaments the player is currently in
      // NOTE: Tournament participation is stored in TournamentParticipant, not LeaguePlayer
      const playerActiveTournaments = await TournamentParticipant.findAll({
        where: { playerId },
        attributes: [
          'matchesPlayed', 'matchesWon', 'matchesLost', 'framesWon', 'framesLost',
          'pointsEarned', 'highestBreak', 'breaks50Plus', 'breaks100Plus',
          'whitewashWins', 'tournamentId'
        ],
        include: [
          {
            model: Tournament, as: 'tournament',
            where: { status: { [Op.in]: ['registration', 'in_progress', 'fixtures_generated'] } },
            attributes: ['id', 'name', 'sport', 'organizationId', 'status'],
            required: true
          }
        ]
      });

      // 2. Extract unique active seasons from these leagues
      const activeSeasons = [];
      const seenSeasonIds = new Set();
      playerActiveLeagues.forEach(lp => {
        if (lp.league?.season && !seenSeasonIds.has(lp.league.seasonId)) {
          activeSeasons.push(lp.league.season);
          seenSeasonIds.add(lp.league.seasonId);
        }
      });

      // Build stats if we have either active leagues or active tournaments
      if (activeSeasons.length > 0 || (playerActiveTournaments.length > 0 && leagueFilter !== 'league')) {
        // For leagues: Get league IDs from active seasons
        const seasonLeagueIds = playerActiveLeagues.map(lp => lp.leagueId).filter(Boolean);
        const tournamentIds = playerActiveTournaments.map(lp => lp.tournamentId).filter(Boolean);

        let relevantSeasonLeagues = playerActiveLeagues;
        let relevantTournaments = playerActiveTournaments;

        // Filter by sport if needed
        if (game !== 'all') {
          relevantSeasonLeagues = playerActiveLeagues.filter(lp => normalizeDashboardSport((lp.league?.sport || '').toLowerCase()) === game);
          relevantTournaments = playerActiveTournaments.filter(lp => normalizeDashboardSport((lp.tournament?.sport || '').toLowerCase()) === game);
        }

        if (relevantSeasonLeagues.length > 0 || relevantTournaments.length > 0) {
          // Build result scope for season/active tournaments
          const seasonOrgIds = [...new Set(activeSeasons.map(s => s.organizationId))];
          const seasonLeagueIdSet = new Set(seasonLeagueIds);
          const seasonTournamentIdSet = new Set(tournamentIds);

          const seasonResultScope = filteredResults.filter((result) => {
            const inSeasonLeague = leagueFilter !== 'tournament'
              && result.leagueId
              && seasonLeagueIdSet.has(result.leagueId);
            const inSeasonTournament = leagueFilter !== 'league'
              && result.tournamentId
              && seasonTournamentIdSet.has(result.tournamentId);
            return inSeasonLeague || inSeasonTournament;
          });

          let sLeagueMatches = 0;
          let sLeagueWins = 0;
          let sLeagueLosses = 0;
          let sLeagueWalkovers = 0;
          let sLeagueByes = 0;
          let sTournamentMatches = 0;
          let sTournamentWins = 0;
          let sTournamentLosses = 0;
          let sTournamentWalkovers = 0;
          let sTournamentByes = 0;
          let sTotal = 0;
          let sWins = 0;
          let sLosses = 0;
          let sFramesWon = 0;
          let sFramesConceded = 0;
          let sPointsWon = 0;
          let sPointsConceded = 0;
          let sWhitewashWins = 0;
          let sWhitewashLosses = 0;
          let sHighestBreak = 0;
          let sStandingPoints = 0;
          let sWalkoverWins = 0;
          let sWalkoverLosses = 0;
          let sExcludedWalkovers = 0;
          let sExcludedByes = 0;

          // Sum points, frames, and matches from relevant season leagues
          for (const lp of relevantSeasonLeagues) {
            const effectiveMatches = lp.matchesPlayed || 0;
            const effectiveWins = lp.matchesWon || 0;
            const effectiveLosses = lp.matchesLost || 0;

            sStandingPoints += (lp.points || 0);
            sFramesWon += (lp.framesWon || 0);
            sFramesConceded += (lp.framesLost || 0);
            // Removed lp.whitewashes addition here to avoid double-counting with results loop below

            sTotal += effectiveMatches;
            sWins += effectiveWins;
            sLosses += effectiveLosses;

            if (lp.leagueId && !lp.tournamentId) {
              sLeagueMatches += effectiveMatches;
              sLeagueWins += effectiveWins;
              sLeagueLosses += effectiveLosses;
            }
          }

          // Also sum tournament participation stats when included
          if (leagueFilter !== 'league') {
            for (const lp of relevantTournaments) {
              const effectiveMatches = lp.matchesPlayed || 0;
              const effectiveWins = lp.matchesWon || 0;
              const effectiveLosses = lp.matchesLost || 0;

              // Calculate tournament standing points: use stored value if available, else calculate from wins (3 pts/win)
              const tpPoints = (lp.pointsEarned && lp.pointsEarned > 0) ? lp.pointsEarned : (effectiveWins * 3);
              sStandingPoints += tpPoints;
              sFramesWon += (lp.framesWon || 0);
              sFramesConceded += (lp.framesLost || 0);

              sTotal += effectiveMatches;
              sWins += effectiveWins;
              sLosses += effectiveLosses;

              sTournamentMatches += effectiveMatches;
              sTournamentWins += effectiveWins;
              sTournamentLosses += effectiveLosses;
            }
          }

            for (const r of seasonResultScope) {
              const isP1 = r.player1Id === playerId;
              const won = r.winnerId === playerId;
              const lost = Boolean(r.winnerId && r.winnerId !== playerId);
              const isLeagueResult = isLeagueScopedResult(r);
              const isTournamentResult = isTournamentScopedResult(r);
              const isBye = isByeLikeResult(r);

              if (shouldExcludeResultFromStats(r)) {
                if (r.isWalkover) {
                  sExcludedWalkovers += 1;
                  if (won) sWalkoverWins += 1;
                  else if (lost) sWalkoverLosses += 1;
                  if (isLeagueResult) sLeagueWalkovers += 1;
                  if (isTournamentResult) sTournamentWalkovers += 1;
                }

                if (isBye) {
                  sExcludedByes += 1;
                  if (isLeagueResult) sLeagueByes += 1;
                  if (isTournamentResult) sTournamentByes += 1;
                }

                continue;
              }

              // Wins/Losses are already summed from LeaguePlayer above for Season Stats
              // Individual match-level details (points, breaks) still pulled here
              if (String(r.sport).toLowerCase() === 'snooker') {
                const rawFrameDetails = r.snookerFrameDetails;
                const frameDetails = Array.isArray(rawFrameDetails)
                  ? rawFrameDetails
                  : (typeof rawFrameDetails === 'string' ? (() => { try { return JSON.parse(rawFrameDetails); } catch { return []; } })() : []);
                for (const frame of frameDetails) {
                  sPointsWon += isP1 ? (frame.player1Score || frame.p1Score || 0) : (frame.player2Score || frame.p2Score || 0);
                  sPointsConceded += isP1 ? (frame.player2Score || frame.p2Score || 0) : (frame.player1Score || frame.p1Score || 0);
                }

                if ((r.highestBreak || 0) > sHighestBreak) sHighestBreak = r.highestBreak || 0;
              }

              // Dynamically calculate whitewash if not explicitly flagged
              let myWW = isP1 ? (r.player1WhitewashWins || 0) : (r.player2WhitewashWins || 0);
              let oppWW = isP1 ? (r.player2WhitewashWins || 0) : (r.player1WhitewashWins || 0);

              if (myWW === 0 && won) {
                const myF = isP1 ? (r.player1Frames || r.player1RackWins || 0) : (r.player2Frames || r.player2RackWins || 0);
                const oppF = isP1 ? (r.player2Frames || r.player2RackWins || 0) : (r.player1Frames || r.player1RackWins || 0);
                if (oppF === 0 && myF > 0) myWW = 1;
              }
              if (oppWW === 0 && lost) {
                const myF = isP1 ? (r.player1Frames || r.player1RackWins || 0) : (r.player2Frames || r.player2RackWins || 0);
                const oppF = isP1 ? (r.player2Frames || r.player2RackWins || 0) : (r.player1Frames || r.player1RackWins || 0);
                if (myF === 0 && oppF > 0) oppWW = 1;
              }

              sWhitewashWins += myWW;
              sWhitewashLosses += oppWW;
            }

            const sWinRate = sTotal > 0 ? Math.round((sWins / sTotal) * 1000) / 10 : 0;

            // Build context info based on whether we have leagues or tournaments
            let contextName = '';
            let currentWeek = null;
            let totalWeeks = null;
            let daysLeft = null;
            let leagueNames = [];
            let tournamentNames = [];

            // Handle league-based season context (only if not filtering by tournament-only)
            if (leagueFilter !== 'tournament' && activeSeasons.length > 0 && relevantSeasonLeagues.length > 0) {
              const primarySeason = activeSeasons[0];
              const startDate = new Date(primarySeason.startDate);
              const endDate = new Date(primarySeason.endDate);
              const msPerWeek = 7 * 24 * 60 * 60 * 1000;
              totalWeeks = Math.ceil((endDate - startDate) / msPerWeek);
              currentWeek = Math.ceil((today - startDate) / msPerWeek);
              daysLeft = Math.max(0, Math.ceil((endDate - today) / (24 * 60 * 60 * 1000)));
              contextName = primarySeason.name;
              leagueNames = relevantSeasonLeagues.map(lp => lp.league?.name).filter(Boolean);
            }

            // Handle tournament context (only if not filtering by league-only)
            if (leagueFilter !== 'league' && relevantTournaments.length > 0) {
              tournamentNames = relevantTournaments.map(lp => lp.tournament?.name).filter(Boolean);
              if (!contextName && tournamentNames.length > 0) {
                contextName = tournamentNames.join(', ');
              }
            }

            seasonStats = {
              seasonName: contextName || 'Current Competitions',
              currentWeek: currentWeek || null,
              totalWeeks: totalWeeks || null,
              daysLeft: daysLeft || null,
              leagueNames,
              tournamentNames,
              leagueMatches: sLeagueMatches,
              leagueWins: sLeagueWins,
              leagueLosses: sLeagueLosses,
              leagueWalkovers: sLeagueWalkovers,
              leagueByes: sLeagueByes,
              tournamentMatches: sTournamentMatches,
              tournamentWins: sTournamentWins,
              tournamentLosses: sTournamentLosses,
              totalMatches: sTotal,
              totalWins: sWins,
              totalLosses: sLosses,
              walkovers: sExcludedWalkovers,
              walkoverWins: sWalkoverWins,
              walkoverLosses: sWalkoverLosses,
              byeExcluded: sExcludedByes,
              walkoverExcluded: sExcludedWalkovers,
              framesWon: sFramesWon,
              framesConceded: sFramesConceded,
              pointsWon: sPointsWon,
              pointsConceded: sPointsConceded,
              whitewashWins: sWhitewashWins,
              whitewashLosses: sWhitewashLosses,
              highestBreak: sHighestBreak,
              standingPoints: sStandingPoints,
              winRate: sWinRate
            };
          }
        }
      } catch (seasonErr) {
      console.error('[getDashboardStats] Season stats error:', seasonErr.message);
      // Continue without season stats
    }

    // ── 5. Performance trend (last 10 competitive matches) ──────────────────
    const last10 = competitiveResultsWithWinner.slice(0, 10).reverse(); // oldest → newest for chart
    let totalFramesForAvg = 0, frameMatchCount = 0;
    const trendData = last10.map((r, idx) => {
      const isP1 = r.player1Id === playerId;
      const won = r.winnerId === playerId;
      const opponent = isP1 ? r.player2?.name : r.player1?.name;
      let score = '';

      if (String(r.sport).toLowerCase() === 'snooker' || String(r.sport).toLowerCase() === 'pooker') {
        const myF = isP1 ? (r.player1Frames || 0) : (r.player2Frames || 0);
        const oppF = isP1 ? (r.player2Frames || 0) : (r.player1Frames || 0);
        score = `${myF}-${oppF}`;
        totalFramesForAvg += myF + oppF;
        frameMatchCount++;
      } else if (String(r.sport).toLowerCase() === 'pool') {
        const myR = isP1 ? (r.player1RackWins || 0) : (r.player2RackWins || 0);
        const oppR = isP1 ? (r.player2RackWins || 0) : (r.player1RackWins || 0);
        score = `${myR}-${oppR}`;
      }

      return {
        index: idx + 1,
        result: won ? 'win' : 'loss',
        opponent: opponent || 'Unknown',
        score,
        date: r.confirmedAt || r.adminApprovedAt || r.submittedAt,
        sport: r.sport
      };
    });

    const avgFramesPerMatch = frameMatchCount > 0
      ? Math.round((totalFramesForAvg / frameMatchCount) * 100) / 100
      : 0;

    // ── 6. Head-to-head records ──────────────────────────────────────────────
    const h2hMap = {};
    for (const r of competitiveResultsWithWinner) {
      const isP1 = r.player1Id === playerId;
      const oppId = isP1 ? r.player2Id : r.player1Id;
      const oppName = isP1 ? r.player2?.name : r.player1?.name;
      if (!oppId) continue;

      if (!h2hMap[oppId]) {
        h2hMap[oppId] = { id: oppId, name: oppName || 'Unknown', wins: 0, losses: 0 };
      }
      if (r.winnerId === playerId) h2hMap[oppId].wins++;
      else h2hMap[oppId].losses++;
    }

    const headToHead = Object.values(h2hMap)
      .map(h => ({
        opponent: { id: h.id, name: h.name },
        wins: h.wins,
        losses: h.losses,
        played: h.wins + h.losses,
        winRate: (h.wins + h.losses) > 0
          ? Math.round((h.wins / (h.wins + h.losses)) * 1000) / 10
          : 0
      }))
      .sort((a, b) => b.played - a.played)
      .slice(0, 10);

  // ── 7. Recent matches (last 5 competitive) ───────────────────────────────
  const recentMatches = competitiveResultsWithWinner.slice(0, 5).map(r => {
      const isP1 = r.player1Id === playerId;
      const won = r.winnerId === playerId;
      let score = '';
      if (String(r.sport).toLowerCase() === 'snooker' || String(r.sport).toLowerCase() === 'pooker') {
        const myF = isP1 ? (r.player1Frames || 0) : (r.player2Frames || 0);
        const oppF = isP1 ? (r.player2Frames || 0) : (r.player1Frames || 0);
        score = `${myF}-${oppF}`;
      } else if (String(r.sport).toLowerCase() === 'pool') {
        const myR = isP1 ? (r.player1RackWins || 0) : (r.player2RackWins || 0);
        const oppR = isP1 ? (r.player2RackWins || 0) : (r.player1RackWins || 0);
        score = `${myR}-${oppR}`;
      }

      const opponent = isP1 ? r.player2?.name : r.player1?.name;
      return {
        id: r.id,
        opponent: opponent || 'Unknown',
        result: won ? 'win' : 'loss',
        score,
        date: r.confirmedAt || r.adminApprovedAt || r.submittedAt,
        matchType: r.matchType,
        sport: r.sport,
        contextName: r.league?.name || r.tournament?.name || null
      };
    });

    // Recent walkover results (separate list) — use filteredResults so sport/type filter applies
    const recentWalkovers = filteredResults
      .filter(r => r.isWalkover)
      .slice(0, 5)
      .map(r => {
        const isP1 = r.player1Id === playerId;
        const won = r.winnerId === playerId;
        const opponent = isP1 ? r.player2?.name : r.player1?.name;
        return {
          id: r.id,
          opponent: opponent || 'Unknown',
          result: won ? 'win' : 'loss',
          score: 'W/O',
          date: r.confirmedAt || r.adminApprovedAt || r.submittedAt,
          matchType: r.matchType,
          sport: r.sport,
          isWalkover: true
        };
      });

    // ── 8. Upcoming bookings ─────────────────────────────────────────────────
    let upcomingBookings = [];
    try {
      const bookingRows = await Booking.findAll({
        where: {
          [Op.or]: [{ playerId }, { opponentId: playerId }],
          bookingDate: { [Op.gte]: today.toISOString().slice(0, 10) },
          status: { [Op.in]: ['confirmed', 'pending'] }
        },
        include: [
          { model: Player, as: 'player', attributes: ['id', 'name'], required: false },
          { model: Player, as: 'opponent', attributes: ['id', 'name'], required: false }
        ],
        order: [['bookingDate', 'ASC'], ['startTime', 'ASC']],
        limit: 5,
        attributes: ['id', 'bookingDate', 'startTime', 'endTime', 'tableNumber', 'tableName', 'status', 'sport', 'playerId', 'opponentId', 'venueId', 'bookingType']
      });

      upcomingBookings = bookingRows.map(b => {
        const isBooker = b.playerId === playerId;
        const opponent = isBooker ? b.opponent : b.player;
        return {
          id: b.id,
          date: b.bookingDate,
          startTime: b.startTime,
          endTime: b.endTime,
          tableNumber: b.tableNumber,
          tableName: b.tableName || `Table ${b.tableNumber}`,
          status: b.status,
          sport: b.sport,
          opponent: opponent?.name || 'TBA',
          bookingType: b.bookingType
        };
      });
    } catch (bookingErr) {
      console.error('[getDashboardStats] Booking fetch error:', bookingErr.message);
    }

    res.json({
      success: true,
      data: {
        filter: { leagueFilter, game: rawGame },
        streak,
        overallStats,
        seasonStats,
        breakStats: {
          centuryBreaks: overallStats.centuryBreaks,
          halfCenturies: overallStats.halfCenturies,
          personalBest: overallStats.highestBreak
        },
        performanceTrend: { last10: trendData, avgFramesPerMatch },
        headToHead,
        recentMatches,
        recentWalkovers,
        upcomingBookings
      }
    });

  } catch (error) {
    console.error('[getDashboardStats] Error:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * GET /api/player/dashboard/stats-engine
 *
 * Deep-dive analysis of the last 10 confirmed matches for the Stats Engine modal.
 */
exports.getStatsEngine = async (req, res) => {
  try {
    const { userId } = req.user;

    const player = await resolvePlayerProfile(userId);
    if (!player) {
      return res.status(404).json({ success: false, error: 'Player not found' });
    }

    const playerId = player.id;

    // 1. Fetch last 10 confirmed competitive matches (excluding walkovers/byes)
    const matches = await MatchResult.findAll({
      where: {
        [Op.or]: [{ player1Id: playerId }, { player2Id: playerId }],
        resultStatus: 'Confirmed',
        isWalkover: false,
        player1Id: { [Op.ne]: null },
        player2Id: { [Op.ne]: null }
      },
      include: [
        { model: Player, as: 'player1', attributes: ['id', 'name'] },
        { model: Player, as: 'player2', attributes: ['id', 'name'] },
        { model: League, as: 'league', attributes: ['id', 'name'], required: false },
        { model: Tournament, as: 'tournament', attributes: ['id', 'name'], required: false },
        {
          model: Fixture,
          as: 'fixture',
          attributes: ['id', 'leagueId', 'tournamentId'],
          required: false,
          include: [
            { model: League, as: 'league', attributes: ['id', 'name'], required: false },
            { model: Tournament, as: 'tournament', attributes: ['id', 'name'], required: false }
          ]
        }
      ],
      order: [[sequelize.fn('COALESCE', sequelize.col('confirmedAt'), sequelize.col('adminApprovedAt'), sequelize.col('submittedAt')), 'DESC']],
      limit: 10,
      attributes: [
        'id', 'player1Id', 'player2Id', 'winnerId', 'matchType', 'sport',
        'player1Frames', 'player2Frames', 'player1RackWins', 'player2RackWins',
        'snookerFrameDetails', 'confirmedAt', 'adminApprovedAt', 'submittedAt', 'leagueId', 'tournamentId', 'fixtureId'
      ]
    });

    if (matches.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No match history found'
      });
    }

    // 2. Process matches to extract metrics
    let totalWins = 0;
    let totalLosses = 0;
    let totalFramesWon = 0;
    let totalFramesLost = 0;
    let totalPointsWon = 0;
    let totalPointsConceded = 0;
    let frameCount = 0;

    const processedMatches = matches.map(m => {
      const isP1 = m.player1Id === playerId;
      const won = m.winnerId === playerId;
      const opponent = isP1 ? m.player2?.name : m.player1?.name;

      let myFrames = 0;
      let oppFrames = 0;
      let myPoints = 0;
      let oppPoints = 0;

      if (String(m.sport).toLowerCase() === 'snooker' || String(m.sport).toLowerCase() === 'pooker') {
        myFrames = Number(isP1 ? (m.player1Frames || 0) : (m.player2Frames || 0));
        oppFrames = Number(isP1 ? (m.player2Frames || 0) : (m.player1Frames || 0));

        const frameDetails = Array.isArray(m.snookerFrameDetails)
          ? m.snookerFrameDetails
          : (typeof m.snookerFrameDetails === 'string' ? (() => { try { return JSON.parse(m.snookerFrameDetails); } catch { return []; } })() : []);

        let matchMyPoints = 0;
        let matchOppPoints = 0;

        for (const frame of frameDetails) {
          const p1Pts = Number(frame.player1Score || frame.p1Score || 0);
          const p2Pts = Number(frame.player2Score || frame.p2Score || 0);

          if (isP1) {
            matchMyPoints += p1Pts;
            matchOppPoints += p2Pts;
          } else {
            matchMyPoints += p2Pts;
            matchOppPoints += p1Pts;
          }
          frameCount++;
        }
        myPoints = matchMyPoints;
        oppPoints = matchOppPoints;
      } else if (String(m.sport).toLowerCase() === 'pool') {
        myFrames = Number(isP1 ? (m.player1RackWins || 0) : (m.player2RackWins || 0));
        oppFrames = Number(isP1 ? (m.player2RackWins || 0) : (m.player1RackWins || 0));
        myPoints = myFrames;
        oppPoints = oppFrames;
        frameCount += (myFrames + oppFrames);
      }

      const pointDiff = myPoints - oppPoints;

      const totalMatchFrames = myFrames + oppFrames;
      const avgPointsPerFrame = totalMatchFrames > 0 ? (myPoints / totalMatchFrames) : 0;

      if (won) totalWins++;
      else totalLosses++;

      totalFramesWon += myFrames;
      totalFramesLost += oppFrames;
      totalPointsWon += myPoints;
      totalPointsConceded += oppPoints;

      const competitionName = m.league?.name ||
                             m.tournament?.name ||
                             m.fixture?.league?.name ||
                             m.fixture?.tournament?.name ||
                             'Competition';

      return {
        id: m.id,
        opponent,
        score: `${myFrames}-${oppFrames}`,
        result: won ? 'W' : 'L',
        points: myPoints,
        pointDiff,
        avgPointsPerFrame,
        matchType: m.matchType,
        location: m.league?.venue || (m.matchType === 'tournament' ? 'Tournament Match' : 'Pakistan'), // Fallback as per design
        contextName: competitionName,
        date: m.confirmedAt || m.adminApprovedAt || m.submittedAt
      };
    });

    // 3. Find Best and Worst matches
    // Criteria: Average Points per Frame (Efficiency)
    const bestMatch = [...processedMatches].sort((a, b) => b.avgPointsPerFrame - a.avgPointsPerFrame)[0];
    const worstMatch = [...processedMatches].sort((a, b) => a.avgPointsPerFrame - b.avgPointsPerFrame)[0];

    // 4. Comparison: Recent 5 vs Previous 5
    const recent5 = processedMatches.slice(0, 5);
    const previous5 = processedMatches.slice(5, 10);
    const recent5Wins = recent5.filter(m => m.result === 'W').length;
    const previous5Wins = previous5.filter(m => m.result === 'W').length;

    // 5. Current Win Streak
    let currentStreak = 0;
    if (processedMatches.length > 0 && processedMatches[0].result === 'W') {
      for (const m of processedMatches) {
        if (m.result === 'W') currentStreak++;
        else break;
      }
    }

    const avgScoredPerFrame = frameCount > 0 ? (totalPointsWon / frameCount).toFixed(1) : 0;
    const avgConcededPerFrame = frameCount > 0 ? (totalPointsConceded / frameCount).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        summary: {
          won: totalWins,
          lost: totalLosses,
          framesWon: totalFramesWon,
          framesLost: totalFramesLost,
          winPercentage: Math.round((totalWins / processedMatches.length) * 100),
          pointsScored: totalPointsWon,
          pointsConceded: totalPointsConceded,
          avgScoredPerFrame,
          avgConcededPerFrame
        },
        bestMatch,
        worstMatch,
        streak: {
          count: currentStreak,
          type: 'win' // Front end only shows streak if it's a win streak as per screenshot "2 Win Streak"
        },
        history: processedMatches.map(m => m.result).reverse(), // Oldest to Recent for the W/L boxes?
        // Wait, screenshot shows "Recent" on left and "Older" on right. So processedMatches.map(m => m.result) is already Recent to Older.
        comparison: {
          recent5Wins,
          previous5Wins,
          status: recent5Wins >= previous5Wins ? 'Consistent performance' : 'Form dipping'
        }
      }
    });

  } catch (error) {
    console.error('getStatsEngine error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
