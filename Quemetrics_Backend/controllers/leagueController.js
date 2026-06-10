const { Op } = require("sequelize");
const {
  League,
  Organization,
  Season,
  Division,
  LeaguePlayer,
  Player,
  Fixture,
  PokerTournamentStructure,
  VenueOwner,
  LeagueVenueRequest,
  User,
  Club,
  Game,
  Booking,
  MatchResult,
  DisputedMatch,
  CompetitionTeam
} = require("../models");
const cache = require("../utils/cache");
const { v4: uuidv4 } = require('uuid');
const { sendLeagueInvitation, sendLeagueEnrollmentEmail } = require('../utils/email');
const sequelize = require("../config/db");
const { DataTypes } = require('sequelize');
const { generateFixturesForLeague, determineSportFromGameName } = require('../services/fixtureGenerator');
const { processOverdueFixtures } = require('../services/fixtureService');
const standingsService = require("../services/standingsService");
const { ensureFixtureColumns } = require("../utils/ensureFixtureColumns");
const { resolveVenueOwnerMerged } = require("../utils/venueOwnerEmbedded");


// ============================================
// UTILITY: Generate unique join code ABC-123
// ============================================
const generateJoinCode = async () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  let code;
  let attempts = 0;
  while (attempts < 10) {
    const letters = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const numbers = Array.from({ length: 3 }, () => digits[Math.floor(Math.random() * digits.length)]).join('');
    code = `${letters}-${numbers}`;
    try {
      const existing = await League.findOne({ where: { joinCode: code } });
      if (!existing) break;
    } catch (e) {
      break; // If DB check fails, proceed with generated code
    }
    attempts++;
  }
  return code;
};

// Ensure `leagues` table has new venue-related columns at runtime so endpoints
// do not fail when migrations were not applied yet.
const ensureLeagueColumns = async () => {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('leagues');

    if (!tableDesc.venueOwnerId) {
      try {
        await qi.addColumn('leagues', 'venueOwnerId', {
          type: DataTypes.CHAR(36),
          allowNull: true,
          comment: 'Reference to VenueOwner (the venue for this league)'
        });
      } catch (e) {
      }
    }

    if (!tableDesc.venueApprovalRequestId) {
      try {
        await qi.addColumn('leagues', 'venueApprovalRequestId', {
          type: DataTypes.CHAR(36),
          allowNull: true,
          comment: 'Reference to VenueApprovalRequest if using another organizer venue'
        });
      } catch (e) {
      }
    }

    if (!tableDesc.leagueType) {
      try {
        await qi.addColumn('leagues', 'leagueType', {
          type: DataTypes.ENUM('fixed', 'rolling'),
          allowNull: false,
          defaultValue: 'fixed',
          comment: 'fixed = fixtures locked; rolling = fixtures regenerate on new join'
        });
      } catch (e) {
      }
    }

    if (!tableDesc.joinAllowed) {
      try {
        await qi.addColumn('leagues', 'joinAllowed', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: 'Whether players are allowed to self-join this league'
        });
      } catch (e) {
      }
    }

    if (!tableDesc.lateJoinAllowed) {
      try {
        await qi.addColumn('leagues', 'lateJoinAllowed', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'Whether players can join an active (ongoing) league'
        });
      } catch (e) {
      }
    }

    if (!tableDesc.minPlayers) {
      try {
        await qi.addColumn('leagues', 'minPlayers', {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: 'Minimum players required for the league'
        });
      } catch (e) {
      }
    }

    if (!tableDesc.joinCode) {
      try {
        await qi.addColumn('leagues', 'joinCode', {
          type: DataTypes.STRING(10),
          allowNull: true,
          unique: true,
          comment: 'Short alphanumeric code for joining (e.g., ABC-123)'
        });
      } catch (e) {
      }
    }

    if (!tableDesc.generalInviteToken) {
      try {
        await qi.addColumn('leagues', 'generalInviteToken', {
          type: DataTypes.CHAR(36),
          allowNull: true,
          comment: 'Unique token for shareable join links'
        });
      } catch (e) {
      }
    }

    // Also ensure fixture columns exist whenever we ensure league columns
    await ensureFixtureColumns();
  } catch (err) {
    console.error("ensureLeagueColumns error:", err.message || err);
  }
};

/**
 * Helper to clear league-related caches
 */
const clearLeagueCache = async () => {
  try {
    const deletedCount = await cache.delStartWith('leagues:');
    if (deletedCount > 0) {
    }
  } catch (err) {
  }
};

// ============================================
// COMMON LEAGUE OPERATIONS
// ============================================

/**
 * Internal helper to process venue approval requests for a league.
 * Returns information about whether approval is required and sends email requests.
 */
const processVenueApproval = async (league, organization, venueId, userId) => {
  try {
    if (!organization) {
      throw new Error('Organization is required for venue approval processing');
    }
    // Check if this is a composite VenueOwner venue ID (venueOwnerId:venueName)
    const isCompositeVenueOwnerId = typeof venueId === 'string' && venueId.includes(':') && !venueId.startsWith('venue_');
    const isClubVenueId = typeof venueId === 'string' && venueId.startsWith('venue_');

    let requestedVenueName = "Venue";
    let actualVenueOwnerId = null;
    let recipientEmail = null;
    let ownerName = "Venue Owner";
    let requiresApproval = false;
    let venueApprovalRequestId = null;
    let isPendingApproval = false;

    if (isCompositeVenueOwnerId) {
      // Handle composite VenueOwner venue ID: venueOwnerId:venueIdentifier
      const [venueOwnerId, venueIdentifier] = venueId.split(':');
      actualVenueOwnerId = venueOwnerId;

      const venueOwner = await VenueOwner.findByPk(venueOwnerId);
      if (!venueOwner) {
        throw new Error(`Venue owner not found for venue: ${venueIdentifier}`);
      }

      // Use the actual venue name from VenueOwner record, not the generated identifier
      const actualVenueName = venueOwner.venueName || `Venue (${venueIdentifier})`;
      requestedVenueName = actualVenueName;

      requiresApproval = venueOwner.organizationId !== organization.id;
      if (requiresApproval) {
        // Get venue owner details for email
        const ownerOrg = await Organization.findByPk(venueOwner.organizationId);
        if (ownerOrg && ownerOrg.userId) {
          const ownerUser = await User.findByPk(ownerOrg.userId);
          if (ownerUser) {
            recipientEmail = ownerUser.email;
            ownerName = ownerUser.name || ownerOrg.contactPersonName || "Venue Owner";
          }
        }

        // Create or update approval request
        const { LeagueVenueRequest } = require("../models");
        const existingRequest = await LeagueVenueRequest.findOne({
          where: { leagueId: league.id, venueOwnerId: venueOwnerId }
        });

        if (!existingRequest) {
          const requestingEntityName = organization?.organizationName || organization?.name || 'Organization';

          const approvalRequest = await LeagueVenueRequest.create({
            leagueId: league.id,
            organizationId: organization.id,
            requestingEntityName: requestingEntityName,
            venueOwnerId: venueOwnerId,
            venueId: venueId, // Store the full requested venue identifier (e.g. "ownerId:venueIdentifier")
            requestedByOrganizationId: organization.id,
            status: 'pending',
            venueName: actualVenueName,
            notes: `Request to use venue "${actualVenueName}" in league "${league.name}"`
          });
          venueApprovalRequestId = approvalRequest.id;
        } else {
          venueApprovalRequestId = existingRequest.id;
        }

        isPendingApproval = true;
      }
    } else if (isClubVenueId) {
      // Club Venues cannot be requested using LeagueVenueRequest because they don't have a VenueOwner
      throw new Error("You cannot select a legacy club venue. Please select venues from verified venue owners only.");
    } else {
      // Handle legacy VenueOwner Case (direct UUID)
      const venueOwner = await VenueOwner.findByPk(venueId);
      if (!venueOwner) {
        throw new Error("Venue not found");
      }

      actualVenueOwnerId = venueId;
      requestedVenueName = venueOwner.venueName || `${venueOwner.organization?.organizationName || "Unknown"} Venue`;
      requiresApproval = venueOwner.organizationId !== organization.id;

      if (requiresApproval) {
        // Get venue owner details for email
        const ownerOrg = await Organization.findByPk(venueOwner.organizationId);
        if (ownerOrg && ownerOrg.userId) {
          const ownerUser = await User.findByPk(ownerOrg.userId);
          if (ownerUser) {
            recipientEmail = ownerUser.email;
            ownerName = ownerUser.name || ownerOrg.contactPersonName || "Venue Owner";
          }
        }

        // Create or update approval request
        const { LeagueVenueRequest } = require("../models");
        const existingRequest = await LeagueVenueRequest.findOne({
          where: { leagueId: league.id, venueOwnerId: venueId }
        });

        if (!existingRequest) {
          const approvalRequest = await LeagueVenueRequest.create({
            leagueId: league.id,
            organizationId: organization.id,
            requestingEntityName: organization.organizationName || organization.name || 'Organization',
            venueOwnerId: venueId,
            venueId: venueId, // Persist the requested venue identifier (UUID or name)
            requestedByOrganizationId: organization.id,
            status: 'pending',
            venueName: requestedVenueName,
            notes: `Request to use venue "${requestedVenueName}" in league "${league.name}"`
          });
          venueApprovalRequestId = approvalRequest.id;
        } else {
          venueApprovalRequestId = existingRequest.id;
        }

        isPendingApproval = true;
      }
    }

    if (!venueOwner && String(venueOwnerId).startsWith('venue_')) {
      // Look for legacy venue in clubs (only active clubs)
      const myClubs = await Club.findAll({ where: { organizationId: organization.id, status: "active" } });
      let foundClub = null;
      let foundVenue = null;

      for (const club of myClubs) {
        const venuesArray = Array.isArray(club.venues)
          ? (typeof club.venues === 'string' ? JSON.parse(club.venues) : club.venues)
          : club.venues && typeof club.venues === 'object'
            ? Object.values(club.venues)
            : [];

        const v = venuesArray.find(v => (v.id || v.venueId) === venueOwnerId);
        if (v) { foundClub = club; foundVenue = v; break; }
      }

      if (!foundClub) {
        const otherClubs = await Club.findAll({ where: { organizationId: { [Op.ne]: organization.id }, status: "active" } });
        for (const club of otherClubs) {
          const venuesArray = Array.isArray(club.venues)
            ? (typeof club.venues === 'string' ? JSON.parse(club.venues) : club.venues)
            : club.venues && typeof club.venues === 'object'
              ? Object.values(club.venues)
              : [];
          const v = venuesArray.find(v => (v.id || v.venueId) === venueOwnerId);
          if (v) { foundClub = club; foundVenue = v; break; }
        }
      }

      if (foundClub && foundVenue) {
        if (foundClub.organizationId === organization.id) {
          requestedVenueName = foundVenue.name || foundVenue.venueName || "Club Venue";
          requiresApproval = false;
        } else {
          venueOwner = await VenueOwner.findOne({ where: { organizationId: foundClub.organizationId } });
          if (!venueOwner) {
            const ownerOrg = await Organization.findByPk(foundClub.organizationId);
            venueOwner = await VenueOwner.create({
              organizationId: foundClub.organizationId,
              venueName: foundClub.name,
              name: ownerOrg ? ownerOrg.organizationName : foundClub.name,
              email: foundClub.email || (ownerOrg ? ownerOrg.email : null),
              phoneNumber: foundClub.phone || (ownerOrg ? ownerOrg.phoneNumber : null),
              address: foundClub.address,
              isInviteAccepted: false
            });
          }
          requestedVenueName = foundVenue.name || foundVenue.venueName || "Club Venue";
          requiresApproval = true;
        }
      }
    }

    if (venueOwner) {
      requestedVenueName = venueOwner.venueName || venueOwner.name || "Venue";
      actualVenueOwnerId = venueOwner.id;
      requiresApproval = venueOwner.organizationId !== organization.id;
      ownerName = venueOwner.name || venueOwner.venueName || 'Venue Owner';
    } else if (!isClubVenueId) {
      // venueOwnerId was provided but NO VenueOwner record was found and it's not a club venue
      throw new Error(
        "Venue not found with ID: " + venueOwnerId + ". " +
        "Only venues from organizations with Venue Owner profiles can send approval requests. " +
        "Please contact the venue owner to set up a Venue Owner profile first."
      );
    }

    if (venueOwner) {
      // Multi-step email resolution with fallback logic
      const venueOwnerUser = venueOwner.userId ? await User.findByPk(venueOwner.userId) : null;
      if (venueOwnerUser && venueOwnerUser.email) {
        recipientEmail = venueOwnerUser.email;
      }

      if (!recipientEmail && venueOwner.email) {
        recipientEmail = venueOwner.email;
      }

      if (!recipientEmail) {
        try {
          const ownerOrg = await Organization.findByPk(venueOwner.organizationId);
          if (ownerOrg && ownerOrg.userId) {
            const ownerOrgUser = await User.findByPk(ownerOrg.userId);
            if (ownerOrgUser && ownerOrgUser.email) {
              recipientEmail = ownerOrgUser.email;
            }
          }
        } catch (ownerErr) {
        }
      }

      // ⚠️ WARNING: If email still not found, log this for debugging
      if (!recipientEmail) {
      }
    }

    return {
      requiresApproval,
      isPendingApproval,
      venueApprovalRequestId,
      recipientEmail,
      ownerName,
      requestedVenueName
    };
  } catch (err) {
    throw err;
  }
};


/**
 * Create a new league (Snooker/Pool/Poker)
 * Snooker: name, seasonId, maxPlayers, format (NO frames here)
 * Pool: name, seasonId, gameType, matchFormat, maxPlayers
 * Poker: name, seasonId, tournamentType, maxPlayers, buyInAmount (NO divisions/frames)
 */
exports.createLeague = async (req, res) => {

  try {
    const { userId, role } = req.user;
    const { sport, seasonId, leagueStartDate, leagueEndDate, ...leagueData } = req.body;

    // Validate organization
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    // Organization verification check commented out to allow creating draft leagues
    // if (!organization.isVerified) {
    //   return res.status(403).json({ success: false, error: "Organization must be verified to create leagues" });
    // }

    // Validate season belongs to this organization and matches the sport
    const season = await Season.findOne({
      where: {
        id: seasonId,
        organizationId: organization.id
      },
      include: [{ association: "game", attributes: ["name"] }]
    });

    if (!season) {
      return res.status(404).json({ success: false, error: "Season not found or doesn't belong to your organization" });
    }

    // Validate sport matches season's game type
    const seasonGameType = season.game.name.toLowerCase();
    if (seasonGameType !== sport.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: `Season is for ${seasonGameType}, but you're trying to create a ${sport} league`
      });
    }

    // Check if season has started
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to midnight for date comparison
    const seasonStartDate = new Date(season.startDate);

    if (seasonStartDate > today && season.status === "upcoming") {
      return res.status(400).json({
        success: false,
        error: `Cannot create league. Season "${season.name}" has not started yet. Season starts on ${season.startDate}`
      });
    }

    // Use provided league dates or fallback to season dates
    const finalStartDate = leagueStartDate || season.startDate;
    const finalEndDate = leagueEndDate || season.endDate;

    // Validate league dates are within season dates if provided
    if (leagueStartDate || leagueEndDate) {
      const leagueStart = new Date(finalStartDate);
      const leagueEnd = new Date(finalEndDate);
      const seasonStart = new Date(season.startDate);
      const seasonEnd = new Date(season.endDate);

      if (leagueStart < seasonStart || leagueStart > seasonEnd) {
        return res.status(400).json({
          success: false,
          error: `League start date must be within season dates (${season.startDate} to ${season.endDate})`
        });
      }

      if (leagueEnd < seasonStart || leagueEnd > seasonEnd) {
        return res.status(400).json({
          success: false,
          error: `League end date must be within season dates (${season.startDate} to ${season.endDate})`
        });
      }

      if (leagueStart > leagueEnd) {
        return res.status(400).json({
          success: false,
          error: "League start date must be before end date"
        });
      }
    }

    // Create league with status = draft and set start/end dates
    // Handle venueIds - Sequelize JSON column handles serialization automatically
    let processedLeagueData = { ...leagueData };

    if (processedLeagueData.venueIds) {
      // Sequelize JSON column handles serialization automatically
      // No need to JSON.stringify
    }

    // Pre-generate join code and invite token
    const newJoinCode = await generateJoinCode();

    // Sync player settings from structure to top-level columns if structure is provided
    let leagueDataToCreate = {
      ...processedLeagueData,
      sport: sport.charAt(0).toUpperCase() + sport.slice(1).toLowerCase(),
      seasonId,
      organizationId: organization.id,
      status: "draft",
      fixturesGenerated: false,
      leagueStartDate: finalStartDate,
      leagueEndDate: finalEndDate,
      joinCode: newJoinCode,
      generalInviteToken: uuidv4(),
    };

    if (processedLeagueData.structure) {
      let struct = processedLeagueData.structure;
      if (typeof struct === 'string') {
        try { struct = JSON.parse(struct); } catch (e) { struct = {}; }
      }
      if (struct.players) {
        if (struct.players.max !== undefined) leagueDataToCreate.maxPlayers = struct.players.max;
        if (struct.players.min !== undefined) leagueDataToCreate.minPlayers = struct.players.min;

        // If late join is enabled, automatically enable rolling join
        // Rolling join is required to regenerate fixtures for late-joining players
        let isRolling = struct.players.rollingJoin;
        if (struct.players.lateJoin && !struct.players.rollingJoin) {
          console.log('[createWizardLeague] Late join enabled without rolling - automatically enabling rolling join');
          isRolling = true;
        }

        if (isRolling !== undefined) {
          leagueDataToCreate.leagueType = isRolling ? 'rolling' : 'fixed';
        }

        if (struct.players.lateJoin !== undefined) leagueDataToCreate.lateJoinAllowed = struct.players.lateJoin;
        // If players are defined in structure, we usually want joinAllowed to be true (self-registration)
        if (leagueDataToCreate.joinAllowed === undefined) leagueDataToCreate.joinAllowed = true;
      }

      // Map scoring rules from structure to matchRules for upload score page
      if (struct.scoring) {
        leagueDataToCreate.matchRules = leagueDataToCreate.matchRules || {};
        if (struct.scoring.scoreDetail) {
          leagueDataToCreate.matchRules.scoreDetail = struct.scoring.scoreDetail;
        }
        if (struct.scoring.pointsSystem) {
          leagueDataToCreate.pointsSystem = struct.scoring.pointsSystem;
        }
        // Add other scoring fields as needed
      }
    }

    // Strict Swiss Validation
    if (leagueDataToCreate.structure && leagueDataToCreate.structure.format === 'swiss') {
      const rounds = leagueDataToCreate.structure.swiss && leagueDataToCreate.structure.swiss.rounds ? parseInt(leagueDataToCreate.structure.swiss.rounds, 10) : 0;
      if (rounds < 3) {
        return res.status(400).json({
          success: false,
          error: "Swiss format requires at least 3 rounds for fair competition."
        });
      }
    }

    const league = await League.create(leagueDataToCreate);
    await clearLeagueCache();

    // NEW: Handle initial roster (leaguePlayers) if provided during wizard creation
    if (req.body.leaguePlayers && Array.isArray(req.body.leaguePlayers)) {
      console.log(`[createLeague] Adding ${req.body.leaguePlayers.length} initial players to roster`);
      for (const p of req.body.leaguePlayers) {
        const pId = p.playerId || p.id;
        if (pId) {
          try {
            await LeaguePlayer.create({
              leagueId: league.id,
              playerId: pId,
              status: "active",
              approvalStatus: "approved", // Admin-added players are auto-approved
              enrollmentDate: new Date()
            });
          } catch (lpErr) {
            console.error(`[createLeague] Failed to add player ${pId}:`, lpErr.message);
          }
        }
      }
    }

    // Handle venue approval requests for all selected venues
    let firstVenueApprovalRequestId = null;
    let emailSent = false;
    const approvalResults = [];

    // Get all venue IDs to process (multiple venues)
    let venueIdsToProcess = [];
    if (leagueData.venueIds) {
      venueIdsToProcess = Array.isArray(leagueData.venueIds) ? leagueData.venueIds : [leagueData.venueIds];
    } else if (leagueData.venueOwnerId) {
      venueIdsToProcess = [leagueData.venueOwnerId];
    }

    // Process each venue for approval
    for (const vId of venueIdsToProcess) {
      try {
        const result = await processVenueApproval(league, organization, vId, userId);
        if (result.requiresApproval && result.venueApprovalRequestId) {
          if (!firstVenueApprovalRequestId) firstVenueApprovalRequestId = result.venueApprovalRequestId;
          approvalResults.push(result);

          // Send approval request email if we have recipient
          if (result.isPendingApproval && result.recipientEmail) {
            const { sendVenueApprovalRequest } = require("../utils/email");
            const organizerUser = await User.findByPk(userId);

            await sendVenueApprovalRequest({
              recipientEmail: result.recipientEmail,
              recipientName: result.ownerName || 'Venue Owner',
              venueName: result.requestedVenueName || 'Your Venue',
              organizationName: organization.organizationName,
              organizerContactEmail: organizerUser?.email || "noreply@cuemetrics.com",
            });
            emailSent = true;
          }
        }
      } catch (err) {
        console.error(`[createLeague] Error processing venue ${vId}:`, err.message);
      }
    }

    // Create a default division for cue sports (Snooker, Pool, Pooker)
    if (["snooker", "pool", "pooker"].includes(sport.toLowerCase())) {
      try {
        const { Division } = require("../models");
        const defaultDivision = await Division.create({
          leagueId: league.id,
          name: "Main Division",
          numberOfFrames: (sport.toLowerCase() === "snooker" || sport.toLowerCase() === "pooker") ? 5 : null,
          raceLength: sport.toLowerCase() === "pool" ? 5 : null,
          status: "active"
        });
      } catch (divisionError) {
        // Don't fail the league creation if division creation fails
      }
    }

    res.status(201).json({
      success: true,
      data: { ...league.toJSON(), venueApprovalRequestId: firstVenueApprovalRequestId },
      message: emailSent
        ? `${sport} league created successfully. Approval request(s) sent to venue owner(s).`
        : `${sport} league created successfully. Status: Draft.`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Player self-join a league
 * POST /leagues/:leagueId/join
 * Validates: joinAllowed, lateJoinAllowed, leagueType for fixture handling
 */
exports.joinLeague = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const { inviteToken, joinCode } = req.body;

    // Ensure columns exist (safe for old DBs)
    await ensureLeagueColumns();

    // Find the league by ID, then fall back to joinCode
    let league;
    if (leagueId) {
      league = await League.findByPk(leagueId);
    }
    // If not found by ID, try looking up by joinCode
    if (!league && joinCode) {
      league = await League.findOne({ where: { joinCode: joinCode.toUpperCase() } });
    }

    if (!league) {
      return res.status(404).json({ success: false, error: 'League not found' });
    }

    // --- Visibility & Joining Logic ---

    // 1. Private: ONLY admin can add players. Self-join is disabled.
    if (league.visibility === 'private') {
      return res.status(403).json({
        success: false,
        error: 'This is a private league. Players cannot join themselves; please contact the administrator to be added.',
        code: 'PRIVATE_LEAGUE_NO_SELF_JOIN'
      });
    }

    // 2. Invite: Must have a valid inviteToken or joinCode
    // We allow joining via individual inviteToken OR the generalInviteToken
    if (league.visibility === 'invite') {
      const isGeneralToken = inviteToken && inviteToken === league.generalInviteToken;
      const isJoinCode = joinCode && joinCode.toUpperCase() === league.joinCode;

      let isValidToken = isGeneralToken || isJoinCode;

      if (!isValidToken) {
        // Check individual invitations
        let basicInfo = league.basicInfo || {};
        if (typeof basicInfo === 'string') {
          try { basicInfo = JSON.parse(basicInfo); } catch (e) { basicInfo = {}; }
        }

        const invitations = basicInfo.joinInvitations || [];
        const invitation = invitations.find(i => i.token === inviteToken);
        if (invitation) {
          const expiresAt = new Date(invitation.expiresAt);
          if (expiresAt > new Date()) {
            isValidToken = true;
          }
        }
      }

      if (!isValidToken) {
        return res.status(403).json({
          success: false,
          error: 'Invalid or expired invitation token/code for this invite-only league.',
          code: 'INVALID_INVITE'
        });
      }
    }

    // 1. Check if joining is globally allowed
    if (league.joinAllowed === false) {
      return res.status(403).json({
        success: false,
        error: 'Joining is not allowed for this league',
        code: 'JOIN_NOT_ALLOWED'
      });
    }

    // 2. League must not be completed or cancelled
    if (league.status === 'completed' || league.status === 'cancelled') {
      return res.status(403).json({
        success: false,
        error: 'Cannot join a completed or cancelled league',
        code: 'LEAGUE_CLOSED'
      });
    }

    // 3. If league is active (ongoing), check lateJoinAllowed
    if (league.status === 'active' && !league.lateJoinAllowed) {
      return res.status(403).json({
        success: false,
        error: league.leagueType === 'fixed'
          ? 'Late joining is not allowed for this fixed league – fixtures are locked'
          : 'Late joining is currently disabled for this league',
        code: 'LATE_JOIN_NOT_ALLOWED'
      });
    }

    // 4. Find the player record for this user (Unify by email for dual-role users)
    const currentUser = await User.findByPk(userId);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const allUsersWithEmail = await User.findAll({
      where: { email: currentUser.email },
      attributes: ['id']
    });
    const userIdsWithSameEmail = allUsersWithEmail.map(u => u.id);

    const player = await Player.findOne({
      where: { userId: { [Op.in]: userIdsWithSameEmail } },
      order: [['createdAt', 'ASC']]
    });

    if (!player) {
      return res.status(404).json({ success: false, error: 'Player profile not found. Please complete your player profile first.' });
    }

    // 5. Check if already enrolled
    const existingEnrollment = await LeaguePlayer.findOne({ where: { leagueId, playerId: player.id } });
    if (existingEnrollment) {
      return res.status(400).json({ success: false, error: 'You are already enrolled in this league' });
    }

    // 6. Check max players capacity
    if (league.maxPlayers) {
      const currentCount = await LeaguePlayer.count({ where: { leagueId } });
      if (currentCount >= league.maxPlayers) {
        return res.status(400).json({ success: false, error: 'League is full – maximum player capacity reached' });
      }
    }

    // 7. Determine enrollment and approval status
    const isLateEnrollment = league.status === 'active';
    const approvalStatus = league.visibility === 'public' ? 'pending' : 'approved';

    // Find the default division for this league (if any)
    const defaultDivision = await Division.findOne({ where: { leagueId } });

    // Create the league player entry
    const leaguePlayer = await LeaguePlayer.create({
      leagueId,
      playerId: player.id,
      divisionId: null, // Will be assigned below if divisions are enabled
      status: isLateEnrollment ? 'late_enrollment' : 'active',
      approvalStatus: approvalStatus,
      enrollmentDate: new Date()
    });

    // ===== AUTO-ASSIGN TO DIVISION (if divisions enabled) =====
    // ONLY if the player was automatically approved (e.g. private league or tournament)
    let divisionAssigned = false;
    if (league.status === 'active' && approvalStatus === 'approved') {
      try {
        const structure = league.structure;
        let parsedStructure = structure;
        if (typeof structure === 'string') {
          try { parsedStructure = JSON.parse(structure); } catch { parsedStructure = {}; }
        }

        if (parsedStructure.divisions && parsedStructure.divisions.enabled) {
          const divSettings = parsedStructure.divisions;
          const assignmentMethod = divSettings.assignmentMethod || 'auto';

          // Find all divisions for this league
          const divisions = await Division.findAll({ where: { leagueId } });

          if (divisions.length > 0) {
            // Fetch all players including the new one
            const allLeaguePlayers = await LeaguePlayer.findAll({
              where: { leagueId },
              include: [{ association: 'player', attributes: ['id', 'name', 'nickname', 'ranking'] }]
            });

            console.log(`Auto-assigning late joining player using ${assignmentMethod} method after player joined`);

            if (assignmentMethod === 'manual') {
              console.log('Manual assignment method configured. Admin must assign player to a division manually.');
              // We do not auto assign here.
            } else {
              // For 'auto' or 'skill' on a late join, we just balance the divisions by size.
              // Reshuffling all players would destroy existing scheduled matches.
              let targetDivisionId = divisions[0].id;
              const divisionCounts = {};
              divisions.forEach(d => divisionCounts[d.id] = 0);

              allLeaguePlayers.forEach(lp => {
                // Count existing players assigned to divisions
                if (lp.divisionId && lp.id !== leaguePlayer.id) {
                  divisionCounts[lp.divisionId] = (divisionCounts[lp.divisionId] || 0) + 1;
                }
              });

              let minCount = Infinity;
              for (const [divId, count] of Object.entries(divisionCounts)) {
                if (count < minCount) {
                  minCount = count;
                  targetDivisionId = divId;
                }
              }

              await leaguePlayer.update({ divisionId: targetDivisionId });
              divisionAssigned = true;
              console.log(`Division assignment completed for player ${player.id} into division ${targetDivisionId}`);
            }
          }
        }
      } catch (divError) {
        console.error('Division assignment failed after player join:', divError);
        // Continue with fixture generation even if division assignment fails
      }
    }

    // Fetch result with associations
    const result = await LeaguePlayer.findByPk(leaguePlayer.id, {
      include: [
        { association: 'player', attributes: ['id', 'name', 'nickname'] },
        { association: 'division', attributes: ['id', 'name'] }
      ]
    });

    // Clear cache so the organizer's league list updates with the new pending player
    await clearLeagueCache(leagueId);

    // Determine the message based on approval status
    let message = 'Successfully joined the league. Fixtures are being updated...';
    if (league.visibility === 'public') {
      message = '✓ Request sent to admin for approval. You will appear in the league once approved.';
    }

    // Respond immediately to player (don't block on fixture regeneration)
    res.status(201).json({
      success: true,
      data: {
        leaguePlayer: result,
        leagueType: league.leagueType,
        approvalStatus: leaguePlayer.approvalStatus
      },
      message: message
    });

    // 8. Queue fixture injection ASYNCHRONOUSLY (fire and forget)
    // ONLY if the player was automatically approved (e.g. private league or tournament)
    if (league.status === 'active' && league.lateJoinAllowed && approvalStatus === 'approved') {
      const { injectLateJoiner } = require("../services/fixtureGenerator");
      injectLateJoiner(leagueId, player.id, leaguePlayer.divisionId)
        .then(() => {
          console.log(`[joinLeague-async] Player ${player.id} injected into future rounds of league ${leagueId}`);
        })
        .catch(fixtureErr => {
          console.error('[joinLeague-async] Failed to inject late joiner:', fixtureErr.message || fixtureErr);
        });
    } else if (league.leagueType === 'rolling' && !league.fixturesGenerated) {
      // For rolling leagues that haven't started yet, generate initial fixtures
      const { generateFixturesForLeague } = require("../services/fixtureGenerator");
      generateFixturesForLeague(leagueId, null, { incremental: false })
        .then(async () => {
          console.log(`[joinLeague-async] Initial fixtures generated for rolling league ${leagueId}`);
          // Persist the fixturesGenerated flag after successful generation
          try {
            await league.update({ fixturesGenerated: true });
            console.log(`[joinLeague-async] fixturesGenerated flag updated for league ${leagueId}`);
          } catch (flagErr) {
            console.error(`[joinLeague-async] Failed to update fixturesGenerated flag: ${flagErr.message}`);
          }
        })
        .catch(fixtureErr => {
          console.error('[joinLeague-async] Failed to generate initial fixtures:', fixtureErr.message || fixtureErr);
        });
    }

    // Send enrollment email (async)
    if (currentUser && currentUser.email && leaguePlayer.approvalStatus === 'approved') {
      try {
        const org = await Organization.findByPk(league.organizationId);
        const divName = result.division ? result.division.name : null;

        sendLeagueEnrollmentEmail({
          email: currentUser.email,
          name: player.name,
          leagueName: league.name || (league.basicInfo && league.basicInfo.leagueName),
          organizerName: org ? org.organizationName : 'An organizer',
          divisionName: divName
        }).then(() => console.log(`[joinLeague-email] Enrollment email sent to ${currentUser.email}`))
          .catch(err => console.error('[joinLeague-email] Error:', err.message));
      } catch (err) {
        console.error('[joinLeague-email] Setup error:', err.message);
      }
    }
  } catch (error) {
    console.error('joinLeague error:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
};

/**
 * Invite a player by email to join a league (sends invitation email)
 */
exports.invitePlayerByEmail = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const { email, name } = req.body;

    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    // Verify organization owns this league
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) return res.status(404).json({ success: false, error: 'Organization not found' });

    const league = await League.findByPk(leagueId);
    if (!league) return res.status(404).json({ success: false, error: 'League not found' });

    if (league.organizationId !== organization.id) {
      return res.status(403).json({ success: false, error: "You don't have access to invite for this league" });
    }

    // Generate invitation token and persist it in league.basicInfo.joinInvitations (safe-parse JSON)
    let basicInfo = league.basicInfo || {};
    if (typeof basicInfo === 'string') {
      try { basicInfo = JSON.parse(basicInfo); } catch (e) { basicInfo = {}; }
    }

    if (!basicInfo.joinInvitations || !Array.isArray(basicInfo.joinInvitations)) basicInfo.joinInvitations = [];

    const invitationToken = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    basicInfo.joinInvitations.push({ token: invitationToken, createdBy: userId, email, expiresAt });

    // Persist updated basicInfo
    league.basicInfo = basicInfo;
    await league.save();

    // Send email using util
    const emailResult = await sendLeagueInvitation({ email, name, invitationToken, leagueName: league.name, organizerName: organization.organizationName });

    res.status(200).json({ success: true, data: { invitationToken, emailSent: !!emailResult.success, emailResult }, message: emailResult.success ? 'Invitation sent' : 'Invitation created but email failed to send' });
  } catch (error) {
    console.error('invitePlayerByEmail error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Join a league via shareable invite link (generalInviteToken)
 * POST /leagues/join-by-token
 * Body: { leagueId, inviteToken }
 */
exports.joinByToken = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId, inviteToken } = req.body;

    if (!inviteToken) {
      return res.status(400).json({ success: false, error: 'inviteToken is required', code: 'MISSING_TOKEN' });
    }

    // Find league by either leagueId+token or token alone
    let league = null;
    if (leagueId) {
      league = await League.findByPk(leagueId);
      if (league && league.generalInviteToken !== inviteToken) {
        // Token mismatch — could be a stale or tampered link
        return res.status(403).json({ success: false, error: 'Invalid or expired invite link.', code: 'INVALID_INVITE' });
      }
    }

    // Fallback: search by generalInviteToken across all leagues
    if (!league) {
      league = await League.findOne({ where: { generalInviteToken: inviteToken } });
    }

    if (!league) {
      return res.status(404).json({ success: false, error: 'League not found or invite link is invalid.', code: 'LEAGUE_NOT_FOUND' });
    }

    // Forward to joinLeague using the found league's ID and the token already validated above
    // Simulate an internal call by re-routing through shared logic
    req.params = { ...req.params, leagueId: league.id };
    req.body = { ...req.body, inviteToken, leagueId: league.id };

    return exports.joinLeague(req, res);
  } catch (error) {
    console.error('joinByToken error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Join a league via short string joinCode
 * POST /leagues/join-by-code
 * Body: { joinCode }
 */
exports.joinByCode = async (req, res) => {
  try {
    const { joinCode } = req.body;

    if (!joinCode) {
      return res.status(400).json({ success: false, error: 'joinCode is required', code: 'MISSING_CODE' });
    }

    // Search by joinCode universally
    const codeSearched = joinCode.trim().toUpperCase();
    const league = await League.findOne({ where: { joinCode: codeSearched } });

    if (!league) {
      return res.status(404).json({ success: false, error: 'League not found or invite code is invalid.', code: 'LEAGUE_NOT_FOUND' });
    }

    // Forward to joinLeague using the found league's ID
    req.params = { ...req.params, leagueId: league.id };
    req.body = { ...req.body, joinCode: codeSearched, leagueId: league.id };

    return exports.joinLeague(req, res);
  } catch (error) {
    console.error('joinByCode error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get join requests for a league (admin only)

/**
 * Get aggregate count of pending join requests for an organization
 */
exports.getOrganizationJoinRequestCount = async (req, res) => {
  try {
    const { userId } = req.user;

    // Find organization profile
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization profile not found" });
    }

    // Total count across all leagues of the organization where approvalStatus is pending
    const count = await LeaguePlayer.count({
      where: {
        approvalStatus: "pending",
      },
      include: [
        {
          model: League,
          as: "league",
          where: { organizationId: organization.id },
          required: true,
        }
      ]
    });

    res.json({
      success: true,
      data: { count },
      message: "Organization join request count retrieved successfully",
    });
  } catch (error) {
    console.error("getOrganizationJoinRequestCount error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get join requests for a single league
 */
exports.getJoinRequests = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const { status } = req.query;

    // Verify organization owns this league
    const league = await League.findByPk(leagueId);
    if (!league) {
      return res.status(404).json({ success: false, error: 'League not found' });
    }

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || league.organizationId !== organization.id) {
      return res.status(403).json({ success: false, error: "You don't have access to this league" });
    }

    // Build query
    const where = { leagueId };
    if (status && status !== 'all') {
      where.approvalStatus = status;
    }

    // Get join requests with player details
    const { Player, User } = require('../models');

    const joinRequests = await LeaguePlayer.findAll({
      where,
      include: [
        {
          association: 'player',
          attributes: ['id', 'name'],
          required: false,
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['email'],
              required: false
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Map to include player details
    const requests = joinRequests.map(lp => ({
      id: lp.id,
      leagueId: lp.leagueId,
      playerId: lp.playerId,
      playerName: lp.player?.name || 'Unknown',
      playerEmail: lp.player?.user?.email || 'N/A',
      approvalStatus: lp.approvalStatus,
      enrollmentDate: lp.enrollmentDate,
      createdAt: lp.createdAt,
      status: lp.status
    }));

    res.status(200).json({ success: true, data: requests });
  } catch (error) {
    console.error('getJoinRequests error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Approve or reject a join request
 */
exports.approveJoinRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId, leaguePlayerId } = req.params;
    const { action, divisionId, regenerateFixtures } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action. Must be "approve" or "reject"' });
    }

    // Verify organization owns this league
    const league = await League.findByPk(leagueId);
    if (!league) {
      return res.status(404).json({ success: false, error: 'League not found' });
    }

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || league.organizationId !== organization.id) {
      return res.status(403).json({ success: false, error: "You don't have access to approve for this league" });
    }

    // Find the league player (join request)
    const leaguePlayer = await LeaguePlayer.findOne({
      where: { id: leaguePlayerId, leagueId }
    });

    if (!leaguePlayer) {
      return res.status(404).json({ success: false, error: 'Join request not found' });
    }

    // Update approval status and optionally assign division
    const updateData = { approvalStatus: action === 'approve' ? 'approved' : 'rejected' };
    if (action === 'approve' && divisionId) {
      updateData.divisionId = divisionId;
    }
    await leaguePlayer.update(updateData);

    // If rejected, optionally remove the player from the league
    if (action === 'reject') {
      await leaguePlayer.destroy();
    }

    // If approved and league is active, inject the player into future rounds
    if (action === 'approve' && league.status === 'active') {
      const { injectLateJoiner } = require("../services/fixtureGenerator");
      injectLateJoiner(leagueId, leaguePlayer.playerId, leaguePlayer.divisionId)
        .then(() => {
          console.log(`[approveJoinRequest-async] Player ${leaguePlayer.playerId} injected into future rounds of league ${leagueId}`);
        })
        .catch(fixtureErr => {
          console.error('[approveJoinRequest-async] Failed to inject late joiner:', fixtureErr.message || fixtureErr);
        });
    } else if (action === 'approve' && regenerateFixtures) {
      // Manual regeneration for non-active leagues if requested
      const { generateFixturesForLeague } = require("../services/fixtureGenerator");
      generateFixturesForLeague(leagueId, null, { incremental: true })
        .then(() => {
          console.log(`[approveJoinRequest-async] Fixtures regenerated for league ${leagueId} after approving player ${leaguePlayer.playerId}`);
        })
        .catch(fixtureErr => {
          console.error('[approveJoinRequest-async] Failed to regenerate fixtures:', fixtureErr.message || fixtureErr);
        });
    }

    res.status(200).json({
      success: true,
      data: {
        leaguePlayerId,
        approvalStatus: updateData.approvalStatus,
        divisionId: updateData.divisionId || null,
        message: action === 'approve' ? (regenerateFixtures ? 'Join request approved and fixtures are being regenerated.' : 'Join request approved.') : 'Join request rejected and player removed'
      }
    });
  } catch (error) {
    console.error('approveJoinRequest error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Manually regenerate fixtures for a league (called by admin after approving join requests)
 * POST /leagues/:leagueId/regenerate-fixtures
 */
exports.regenerateLeagueFixtures = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;

    // Verify organization owns this league
    const league = await League.findByPk(leagueId);
    if (!league) {
      return res.status(404).json({ success: false, error: 'League not found' });
    }

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || league.organizationId !== organization.id) {
      return res.status(403).json({ success: false, error: "You don't have access to regenerate fixtures for this league" });
    }

    // Regenerate fixtures
    const { generateFixturesForLeague } = require('../utils/fixtureGenerator');

    try {
      const result = await generateFixturesForLeague(leagueId, null, { incremental: true });

      res.status(200).json({
        success: true,
        data: { leagueId, fixturesGenerated: true },
        message: 'Fixtures regenerated successfully'
      });
    } catch (fixtureErr) {
      console.error('[regenerateLeagueFixtures] Error:', fixtureErr.message);
      res.status(400).json({
        success: false,
        error: fixtureErr.message || 'Failed to regenerate fixtures'
      });
    }
  } catch (error) {
    console.error('regenerateLeagueFixtures error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get all leagues with filters
 */
exports.getLeagues = async (req, res) => {
  const { resolveVenueOwnerMerged } = require("../utils/venueOwnerEmbedded");
  try {
    const { userId, role } = req.user;
    const { sport, status, organizationId, onlyPublic, honors } = req.query;
    const honorsView = honors === 'true';
    const where = {};

    if (sport) where.sport = sport;
    if (status) where.status = status;

    // If organizationId is provided in query, use it
    if (organizationId) {
      where.organizationId = organizationId;
    } else if (role === "organization") {
      // For organization users, automatically filter by their organization if not super_admin
      const { Organization } = require("../models");
      const organization = await Organization.findOne({ where: { userId } });
      if (organization) {
        where.organizationId = organization.id;
      } else {
        return res.json({ success: true, data: [], message: "No organization found for this user" });
      }
    } else if (role === "player" && !honorsView) {
      // Find the player record for this user (Unify by email for dual-role users)
      const { Player, User } = require("../models");
      const { Op } = require("sequelize");
      const currentUserForRole = await User.findByPk(userId);
      let playerSearchIds = [userId];

      if (currentUserForRole) {
        const allUsersWithEmailForRole = await User.findAll({
          where: { email: currentUserForRole.email },
          attributes: ['id']
        });
        playerSearchIds = allUsersWithEmailForRole.map(u => u.id);
      }

      const player = await Player.findOne({
        where: { userId: { [Op.in]: playerSearchIds } },
        order: [['createdAt', 'ASC']]
      });

      // If onlyPublic param is true, only show public leagues (for discovery tab)
      // Otherwise show public + enrolled leagues (all available leagues view)
      if (onlyPublic === 'true') {
        where.visibility = "public";
        if (!status) {
          where.status = { [Op.in]: ["active", "registration_open"] };
        }
      } else if (player) {
        // Player sees public leagues OR leagues they are enrolled in (approved or pending)
        // Also include registration_open status
        const statusFilter = status ? status : { [Op.in]: ["active", "registration_open"] };
        const sequelize = require("sequelize");
        where[Op.and] = [
          {
            [Op.or]: [
              { visibility: "public" },
              { id: { [Op.in]: sequelize.literal(`(SELECT leagueId FROM league_players WHERE playerId = '${player.id}' AND approvalStatus IN ('approved', 'pending'))`) } }
            ]
          },
          { status: statusFilter }
        ];
      } else {
        // For players, we only show public leagues by default
        where.visibility = "public";
        if (!status) {
          where.status = { [Op.in]: ["active", "registration_open"] };
        }
      }
    }
    // Super admins see everything; other roles see what's filtered by params

    // Ensure DB has the expected columns (helps when migrations haven't been run)
    await ensureLeagueColumns();

    // Build a deterministic cache key from query params and resolved organization
    let resolvedOrgId = organizationId;
    if (!resolvedOrgId && role !== 'super_admin' && where.organizationId) {
      resolvedOrgId = where.organizationId;
    }
    const cacheKeyObj = { sport: sport || null, status: status || null, organizationId: resolvedOrgId || null, role, honors: honorsView };
    const cacheKey = `leagues:${Buffer.from(JSON.stringify(cacheKeyObj)).toString('base64')}`;
    const bypassCache = req.query.cacheBuster != null || req.query.noCache === 'true';

    // Try cache read (safe to fail to avoid breaking the endpoint)
    if (!bypassCache) {
      try {
        const cached = await cache.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          return res.json({ success: true, data: parsed, message: 'Leagues retrieved (cache)' });
        }
      } catch (err) {
        console.warn('Cache read failed for leagues:', err && err.message ? err.message : err);
      }
    }

    const rawLeagues = await League.findAll({
      where,
      include: [
        { association: "organization", attributes: ["id", "organizationName"] },
        { association: "season", include: [{ association: "game" }] },
        { association: "venueOwner", include: [{ association: "organization", attributes: ["organizationName"] }], attributes: ["id", "name", "venueName", "address", "venues"] },
        {
          association: "divisions",
          include: [
            {
              association: "players",
              attributes: ["id"]
            }
          ]
        },
        { association: "leaguePlayers", include: [{ association: "player", attributes: ["id", "name", "nickname"] }], attributes: ["id", "playerId", "divisionId", "status"] },
        {
          association: "venueRequests",
          attributes: ["id", "leagueId", "organizationId", "venueId", "venueName", "status", "createdAt"],
          include: [{ association: "venueOwner", attributes: ["id", "venueName", "name"] }]
        }
      ],
      order: [["createdAt", "DESC"]],
    });

    // Optimization: Fetch all clubs for the organization once to avoid repeated queries in the loop
    let prefetchedClubs = [];
    if (where.organizationId) {
      prefetchedClubs = await Club.findAll({
        where: { organizationId: where.organizationId },
        attributes: ["id", "name", "venues"]
      });
    }

    // Resolve venue names and compute fields for each league
    const leagues = await Promise.all(rawLeagues.map(async (league) => {
      const leagueData = league.toJSON();

      // Resolve venue name
      let resolvedVenue = null;
      if (league.venueOwner) {
        const resolvedInfo = await resolveVenueOwnerMerged(league.venueOwner, {
          organizationId: league.organizationId || league.venueOwner.organizationId,
          venueIds: league.venueIds,
          prefetchedClubs: prefetchedClubs
        });
        resolvedVenue = {
          name: resolvedInfo.displayName || league.venueOwner.venueName || league.venueOwner.organization?.organizationName || league.venueOwner.name,
          address: league.venueOwner.address
        };
      }

      const vRequests = leagueData.venueRequests || [];
      const isVenueApprovalPending = vRequests.some(r => r.status === 'pending');
      const isVenueApprovalRejected = vRequests.some(r => r.status === 'rejected');
      const pendingVenueNames = vRequests.filter(r => r.status === 'pending').map(r => r.venueName || 'Unknown Venue');

      return {
        ...leagueData,
        venue: resolvedVenue,
        isVenueApprovalPending,
        isVenueApprovalRejected,
        pendingVenueNames,
        venueApprovalStatus: vRequests.length === 0
          ? 'none'
          : isVenueApprovalRejected
            ? 'rejected'
            : isVenueApprovalPending
              ? 'pending'
              : 'approved'
      };
    }));

    // Add computed fields for UI display
    const leaguesWithCounts = leagues.map(leagueData => {
      const vRequests = leagueData.venueRequests || [];

      // NEW: Detailed breakdown for UI
      const venueApprovalBreakdown = vRequests.map(r => ({
        requestId: r.id,
        venueId: r.venueId,
        venueName: r.venueName,
        venueOwner: r.venueOwner ? {
          id: r.venueOwner.id,
          name: r.venueOwner.name || r.venueOwner.venueName,
          venueName: r.venueOwner.venueName
        } : null,
        status: r.status
      }));

      const venueApprovalSummary = {
        total: vRequests.length,
        approved: vRequests.filter(r => r.status === 'approved').length,
        pending: vRequests.filter(r => r.status === 'pending').length,
        rejected: vRequests.filter(r => r.status === 'rejected').length
      };

      // Parse matchRules JSON string for frontend consumption
      let parsedMatchRules = {};
      try {
        parsedMatchRules = leagueData.matchRules ? JSON.parse(leagueData.matchRules) : {};
      } catch (parseError) {
        console.warn(`[getLeagues] Failed to parse matchRules for league ${leagueData.id}:`, parseError.message);
        parsedMatchRules = {};
      }

      return {
        ...leagueData,
        matchRules: parsedMatchRules, // Replace string with parsed object
        playersCount: leagueData.leaguePlayers?.length || 0,
        divisionsCount: leagueData.divisions?.length || 0,
        startDate: leagueData.leagueStartDate || leagueData.season?.startDate,
        endDate: leagueData.leagueEndDate || leagueData.season?.endDate,
        venueApprovalBreakdown,
        venueApprovalSummary
      };
    });

    // Cache the result for a short period to speed up subsequent requests
    if (!bypassCache) {
      try {
        const ttl = parseInt(process.env.LEAGUES_CACHE_TTL || '60', 10);
        await cache.set(cacheKey, JSON.stringify(leaguesWithCounts), 'EX', ttl);
      } catch (err) {
        console.warn('Cache write failed for leagues:', err && err.message ? err.message : err);
      }
    }

    res.json({ success: true, data: leaguesWithCounts, message: "Leagues retrieved" });
  } catch (error) {
    console.error("getLeagues error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Get league by ID with full details
 */
exports.getLeagueById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { leagueId } = req.params;

    // Ensure fixture columns exist so the include: fixtures does not fail on missing columns (e.g. date)
    await ensureFixtureColumns();

    // Trigger check for overdue fixtures and process forfeits
    try {
      if (role === 'organization' || role === 'super_admin') {
        await processOverdueFixtures(leagueId);
      }
    } catch (e) {
      console.warn(`[getLeagueById] Auto-forfeit check failed for league ${leagueId}:`, e.message);
    }

    const league = await League.findByPk(leagueId, {
      include: [
        { association: "organization", attributes: ["id", "organizationName", "contactPersonName"] },
        { association: "season", include: [{ association: "game" }] },
        { association: "venueOwner", attributes: ["id", "name", "venueName", "address", "venues"] },
        {
          association: "divisions",
          include: [
            {
              association: "players",
              include: [{ association: "player", attributes: ["id", "name", "nickname"] }]
            }
          ]
        },
        {
          association: "leaguePlayers",
          include: [{ association: "player", attributes: ["id", "name", "nickname"] }]
        },
        {
          association: "fixtures",
          include: [
            { association: "player1", attributes: ["id", "name"] },
            { association: "player2", attributes: ["id", "name"] },
            { association: "division", attributes: ["id", "name"] }
          ]
        },
        { association: "venueApproval" },
        { association: "venueRequests", include: [{ association: "venueOwner", attributes: ["id", "venueName", "name"] }] }
      ],
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    // Authorization check: Organization owner or super_admin can see draft/private leagues. 
    // Players can see public leagues or leagues they are part of.
    if (role !== "super_admin" && league.status === 'draft') {
      const { Organization } = require("../models");
      const userOrganization = await Organization.findOne({ where: { userId } });
      if (!userOrganization || userOrganization.id !== league.organizationId) {
        return res.status(403).json({ success: false, error: "You don't have access to this draft league" });
      }
    }

    // Add start/end dates and approval status to response
    const leagueData = league.toJSON();

    // Resolve venue name
    const { resolveVenueOwnerMerged } = require("../utils/venueOwnerEmbedded");
    let resolvedVenue = null;
    if (league.venueOwner) {
      const resolvedInfo = await resolveVenueOwnerMerged(league.venueOwner, {
        organizationId: league.organizationId || league.venueOwner.organizationId,
        venueIds: league.venueIds
      });
      resolvedVenue = {
        name: resolvedInfo.displayName || league.venueOwner.venueName || league.venueOwner.organization?.organizationName || league.venueOwner.name,
        address: league.venueOwner.address
      };
    }
    leagueData.venue = resolvedVenue;

    // make sure knockout manualOrder is always an array to avoid undefined
    if (leagueData.structure && leagueData.structure.knockout) {
      leagueData.structure.knockout.manualOrder = leagueData.structure.knockout.manualOrder || [];
    }
    leagueData.startDate = leagueData.leagueStartDate || leagueData.season?.startDate;
    leagueData.endDate = leagueData.leagueEndDate || leagueData.season?.endDate;

    // Parse matchRules JSON string for frontend consumption
    let parsedMatchRules = {};
    try {
      parsedMatchRules = leagueData.matchRules ? JSON.parse(leagueData.matchRules) : {};
    } catch (parseError) {
      console.warn(`[getLeagueById] Failed to parse matchRules for league ${leagueData.id}:`, parseError.message);
      parsedMatchRules = {};
    }
    leagueData.matchRules = parsedMatchRules; // Replace string with parsed object

    // Aggregated venue approval status
    const vRequests = leagueData.venueRequests || [];
    leagueData.isVenueApprovalPending = vRequests.some(r => r.status === 'pending');
    leagueData.isVenueApprovalRejected = vRequests.some(r => r.status === 'rejected');
    leagueData.pendingVenueNames = vRequests.filter(r => r.status === 'pending').map(r => r.venueName || 'Unknown Venue');

    // Ensure league.venueApprovalStatus reflects the current requests (avoid stale stored value)
    leagueData.venueApprovalStatus = vRequests.length === 0
      ? 'none'
      : leagueData.isVenueApprovalRejected
        ? 'rejected'
        : leagueData.isVenueApprovalPending
          ? 'pending'
          : 'approved';

    // NEW: Detailed venue approval breakdown for UI display
    leagueData.venueApprovalBreakdown = vRequests.map(r => ({
      requestId: r.id,
      venueId: r.venueId,
      venueName: r.venueName,
      venueOwner: r.venueOwner ? {
        id: r.venueOwner.id,
        name: r.venueOwner.name || r.venueOwner.venueName,
        venueName: r.venueOwner.venueName
      } : null,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      notes: r.notes
    }));

    // Summary counts
    leagueData.venueApprovalSummary = {
      total: vRequests.length,
      approved: vRequests.filter(r => r.status === 'approved').length,
      pending: vRequests.filter(r => r.status === 'pending').length,
      rejected: vRequests.filter(r => r.status === 'rejected').length
    };

    res.json({ success: true, data: leagueData, message: "League retrieved" });
  } catch (error) {
    console.error("getLeagueById error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Update league
 */
exports.updateLeague = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const updateData = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id },
      include: [{ association: "season" }]
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found or not owned by your organization" });
    }

    // Don't allow certain changes after league is published
    if (league.status === "active" && (updateData.format || updateData.sport)) {
      return res.status(400).json({
        success: false,
        error: "Cannot change format or sport of an active league"
      });
    }

    // If seasonId is being changed, update leagueStartDate and leagueEndDate from the new season
    if (updateData.seasonId && updateData.seasonId !== league.seasonId) {
      const newSeason = await Season.findByPk(updateData.seasonId);
      if (!newSeason) {
        return res.status(404).json({ success: false, error: "New season not found" });
      }

      // Check if new season belongs to the organization
      if (newSeason.organizationId !== organization.id) {
        return res.status(403).json({ success: false, error: "Season doesn't belong to your organization" });
      }

      // Update league dates only if not explicitly provided in request
      if (!updateData.leagueStartDate) {
        updateData.leagueStartDate = newSeason.startDate;
      }
      if (!updateData.leagueEndDate) {
        updateData.leagueEndDate = newSeason.endDate;
      }
    }

    // Validate league dates if being updated
    if (updateData.leagueStartDate || updateData.leagueEndDate) {
      const season = league.season;
      const newStartDate = updateData.leagueStartDate || league.leagueStartDate;
      const newEndDate = updateData.leagueEndDate || league.leagueEndDate;

      if (season) {
        const leagueStart = new Date(newStartDate);
        const leagueEnd = new Date(newEndDate);
        const seasonStart = new Date(season.startDate);
        const seasonEnd = new Date(season.endDate);

        if (leagueStart < seasonStart || leagueStart > seasonEnd) {
          return res.status(400).json({
            success: false,
            error: `League start date must be within season dates (${season.startDate} to ${season.endDate})`
          });
        }

        if (leagueEnd < seasonStart || leagueEnd > seasonEnd) {
          return res.status(400).json({
            success: false,
            error: `League end date must be within season dates (${season.startDate} to ${season.endDate})`
          });
        }

        if (leagueStart > leagueEnd) {
          return res.status(400).json({
            success: false,
            error: "League start date must be before end date"
          });
        }
      }
    }
    // Sync player settings from structure to top-level columns if structure is updated
    if (updateData.structure) {
      // Merge structure if it's already an object in DB
      let existingStructure = league.structure || {};
      if (typeof existingStructure === 'string') {
        try { existingStructure = JSON.parse(existingStructure); } catch (e) { existingStructure = {}; }
      }

      let newStructure = updateData.structure;
      if (typeof newStructure === 'string') {
        try { newStructure = JSON.parse(newStructure); } catch (e) { newStructure = {}; }
      }

      // Merge deep nested players object if both exist
      if (existingStructure.players && newStructure.players) {
        newStructure.players = { ...existingStructure.players, ...newStructure.players };
      }

      updateData.structure = { ...existingStructure, ...newStructure };

      const players = updateData.structure.players;
      if (players) {
        if (players.max !== undefined) updateData.maxPlayers = players.max;
        if (players.min !== undefined) updateData.minPlayers = players.min;

        // If late join is enabled, automatically enable rolling join
        let isRolling = players.rollingJoin;
        if (players.lateJoin && !players.rollingJoin) {
          console.log('[saveBulkStructure] Late join enabled without rolling - automatically enabling rolling join');
          isRolling = true;
          updateData.structure.players.rollingJoin = true; // Update the structure data too
        }

        if (isRolling !== undefined) {
          updateData.leagueType = isRolling ? 'rolling' : 'fixed';
        }

        if (players.lateJoin !== undefined) updateData.lateJoinAllowed = players.lateJoin;

        // Ensure joinAllowed is true if rolling or late join is enabled
        if (isRolling || players.lateJoin) {
          updateData.joinAllowed = true;
        }
      }

      // Map scoring rules from structure to matchRules for upload score page
      if (updateData.structure.scoring) {
        updateData.matchRules = updateData.matchRules || league.matchRules || {};
        if (updateData.structure.scoring.scoreDetail) {
          updateData.matchRules.scoreDetail = updateData.structure.scoring.scoreDetail;
        }
        if (updateData.structure.scoring.pointsSystem) {
          updateData.pointsSystem = updateData.structure.scoring.pointsSystem;
        }
        // Add other scoring fields as needed
      }
    }

    // Strict Swiss Validation
    if (updateData.structure && updateData.structure.format === 'swiss') {
      const rounds = updateData.structure.swiss && updateData.structure.swiss.rounds ? parseInt(updateData.structure.swiss.rounds, 10) : 0;
      if (rounds < 3) {
        return res.status(400).json({
          success: false,
          error: "Swiss format requires at least 3 rounds for fair competition."
        });
      }
    }

    // Merge basicInfo if provided
    if (updateData.basicInfo) {
      let existingBasic = league.basicInfo || {};
      if (typeof existingBasic === 'string') {
        try { existingBasic = JSON.parse(existingBasic); } catch (e) { existingBasic = {}; }
      }
      let newBasic = updateData.basicInfo;
      if (typeof newBasic === 'string') {
        try { newBasic = JSON.parse(newBasic); } catch (e) { newBasic = {}; }
      }
      updateData.basicInfo = { ...existingBasic, ...newBasic };
    }

    await league.update(updateData);

    // Handle venue approval requests if venues were updated
    const venueIdsUpdate = updateData.venueIds || (updateData.basicInfo && updateData.basicInfo.venueIds);
    if (venueIdsUpdate) {
      let vIds = [];
      try {
        vIds = typeof venueIdsUpdate === 'string' ? JSON.parse(venueIdsUpdate) : venueIdsUpdate;
        if (!Array.isArray(vIds)) vIds = [vIds];
      } catch (e) {
        vIds = Array.isArray(venueIdsUpdate) ? venueIdsUpdate : [venueIdsUpdate];
      }

      for (const vId of vIds) {
        try {
          await processVenueApproval(league, organization, vId, userId);
        } catch (err) {
          console.error(`[updateLeague] Error processing venue update for ${vId}:`, err.message);
        }
      }
    }

    // Invalidate cache so list view reflects new state
    await clearLeagueCache();

    res.json({ success: true, data: league, message: "League updated" });
  } catch (error) {
    console.error("updateLeague error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Delete league
 */
exports.deleteLeague = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id },
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found or not owned by your organization" });
    }

    // Use transaction for cascading delete to ensure database integrity
    await sequelize.transaction(async (t) => {
      // 1. Delete disputed matches related to the league
      await DisputedMatch.destroy({ where: { leagueId }, transaction: t });

      // 2. Delete match results related to the league
      await MatchResult.destroy({ where: { leagueId }, transaction: t });

      // 3. Delete bookings related to the league
      await Booking.destroy({ where: { leagueId }, transaction: t });

      // 4. Delete fixtures related to the league
      await Fixture.destroy({ where: { leagueId }, transaction: t });

      // 5. Delete double competition teams
      await CompetitionTeam.destroy({ where: { competitionId: leagueId, competitionType: 'league' }, transaction: t });

      // 6. Delete venue requests related to the league
      await LeagueVenueRequest.destroy({ where: { leagueId }, transaction: t });

      // 7. Delete players/participants of the league
      await LeaguePlayer.destroy({ where: { leagueId }, transaction: t });

      // 8. Delete divisions of the league
      await Division.destroy({ where: { leagueId }, transaction: t });

      // 9. Delete poker tournament structures if any
      await PokerTournamentStructure.destroy({ where: { leagueId }, transaction: t });

      // 10. Finally, delete the league itself
      await league.destroy({ transaction: t });
    });
    await clearLeagueCache();

    res.json({ success: true, data: null, message: "League deleted" });
  } catch (error) {
    console.error("deleteLeague error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Publish league (Draft → Registration Open)
 * - Validates basic requirements for opening registration
 * - Changes status to registration_open
 */
exports.publishLeague = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id }
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    if (league.status !== "draft") {
      return res.status(400).json({ success: false, error: "Only draft leagues can be published to registration" });
    }

    // Self-heal: if top-level name/sport columns are null (can happen when an earlier
    // wizard PATCH didn't include leagueName/gameName in that specific call), derive
    // them from the basicInfo JSON blob and persist before the validation check.
    const syncFields = {};
    if (!league.name) {
      const derivedName = league.basicInfo?.leagueName || league.basicInfo?.name;
      if (derivedName) syncFields.name = derivedName;
    }
    if (!league.sport) {
      const derivedSport = determineSportFromGameName(
        league.basicInfo?.gameName || league.gameName
      );
      if (derivedSport) syncFields.sport = derivedSport;
    }
    if (Object.keys(syncFields).length > 0) {
      await league.update(syncFields);
      console.log(`[publishLeague] Self-healed missing columns for league ${leagueId}:`, syncFields);
    }

    // Validate that we now have the required fields
    if (!league.name || !league.sport) {
      return res.status(400).json({ success: false, error: "League name and sport are required to open registration" });
    }

    // Update status to registration_open
    await league.update({ status: "registration_open" });
    await clearLeagueCache(league.id);

    res.json({
      success: true,
      data: league,
      message: "League registration is now open. Players can now join."
    });
  } catch (error) {
    console.error("publishLeague error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Start league (Registration Open → Active)
 * - Locks registration (unless late join allowed)
 * - Generates first round/full schedule
 * - Sets status to active
 */
exports.startLeague = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const { lockRegistration = true } = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) return res.status(404).json({ success: false, error: "Organization not found" });

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id }
    });

    if (!league) return res.status(404).json({ success: false, error: "League not found" });

    if (league.status === "active") {
      return res.json({ success: true, message: "League is already active", data: league });
    }

    if (league.status !== "registration_open" && league.status !== "draft") {
      return res.status(400).json({ success: false, error: "League must be in draft or registration_open state to start" });
    }

    // Check player count (only approved players)
    const playerCount = await LeaguePlayer.count({ where: { leagueId, approvalStatus: 'approved' } });
    if (playerCount < 2) {
      return res.status(400).json({ success: false, error: "At least 2 players are required to start the league" });
    }

    // ===== ROBUST DIVISION SYNCHRONISATION & PLAYER ASSIGNMENT =====
    const normalizedSport = String(league.sport).toLowerCase();
    if (normalizedSport === "snooker" || normalizedSport === "pool" || normalizedSport === "pooker") {
      let structure = league.structure;
      if (typeof structure === 'string') {
        try { structure = JSON.parse(structure); } catch { structure = {}; }
      }

      const divSettings = structure?.divisions || {};
      const isGroupsKnockout = structure?.format === 'groupsKnockout';
      const groupsConfig = structure?.groups || {};

      if (divSettings.enabled || isGroupsKnockout) {
        const groupsCount = isGroupsKnockout
          ? (parseInt(groupsConfig.count, 10) || 1)
          : (parseInt(divSettings.count, 10) || 1);

        const assignmentMethod = isGroupsKnockout
          ? (groupsConfig.assignmentMethod || 'auto')
          : (divSettings.assignmentMethod || 'auto');

        // Find existing divisions
        const { Division } = require("../models");
        let divisions = await Division.findAll({ where: { leagueId: league.id } });

        // If no divisions exist, create them automatically
        if (divisions.length === 0) {
          console.log(`Auto-creating ${groupsCount} divisions for league ${league.id} during start`);

          let bestOfNumber = 5;
          if (structure.matchRules?.bestOf) {
            if (structure.matchRules.bestOf === 'custom') {
              bestOfNumber = structure.matchRules.customFrames || 5;
            } else {
              bestOfNumber = parseInt(structure.matchRules.bestOf, 10) || 5;
            }
          }

          const createdDivs = [];
          for (let i = 1; i <= groupsCount; i++) {
            const divisionName = groupsCount === 1 ? "Division 1" : `Group ${String.fromCharCode(64 + i)}`;
            const divisionPayload = {
              leagueId: league.id,
              name: divisionName,
              maxPlayers: isGroupsKnockout ? (groupsConfig.teamsPerGroup || null) : (divSettings.maxPlayersPerDivision?.[i - 1] || null),
              status: 'active',
            };

            if (String(league.sport).toLowerCase() === 'snooker' || String(league.sport).toLowerCase() === 'pooker') divisionPayload.numberOfFrames = bestOfNumber;
            else if (String(league.sport).toLowerCase() === 'pool') divisionPayload.raceLength = bestOfNumber;

            const newDiv = await Division.create(divisionPayload);
            createdDivs.push(newDiv);
          }
          divisions = createdDivs;
        }

        // Fetch all approved players in league
        const leaguePlayers = await LeaguePlayer.findAll({
          where: { leagueId: league.id, approvalStatus: 'approved' },
          include: [{ association: 'player', attributes: ['id', 'name', 'nickname'] }]
        });

        if (leaguePlayers.length > 0 && divisions.length > 0) {
          console.log(`Assigning ${leaguePlayers.length} players to ${divisions.length} divisions using ${assignmentMethod} method`);

          if (assignmentMethod === 'skill') {
            const sortedPlayers = [...leaguePlayers].sort((a, b) => {
              const rA = a.ranking || 0;
              const rB = b.ranking || 0;
              return rB - rA;
            });
            for (let i = 0; i < sortedPlayers.length; i++) {
              const divIdx = i % divisions.length;
              await sortedPlayers[i].update({ divisionId: divisions[divIdx].id });
            }
          } else if (assignmentMethod === 'manual' && (divSettings.assignedPlayers || groupsConfig.assignedPlayers)) {
            const manualAssignedList = isGroupsKnockout ? groupsConfig.assignedPlayers : divSettings.assignedPlayers;
            const { Op } = require('sequelize');
            for (let di = 0; di < divisions.length; di++) {
              const assignedIds = manualAssignedList[di] || [];
              if (assignedIds.length > 0) {
                const ids = assignedIds.map(id => typeof id === 'object' ? (id.id || id.playerId) : id).filter(Boolean);
                if (ids.length > 0) {
                  await LeaguePlayer.update(
                    { divisionId: divisions[di].id, manuallyAssigned: true },
                    { where: { leagueId: league.id, playerId: { [Op.in]: ids } } }
                  );
                }
              }
            }
          } else {
            // Default Auto assignment
            for (let i = 0; i < leaguePlayers.length; i++) {
              const divIdx = i % divisions.length;
              await leaguePlayers[i].update({ divisionId: divisions[divIdx].id });
            }
          }
        }
      }
    }

    // Update status to active and lock registration if requested
    const updates = { status: "active", currentRound: 1 };
    if (lockRegistration) {
      updates.joinAllowed = false;
    }
    await league.update(updates);

    // Generate fixtures based on strategy
    const { generateFixturesForLeague } = require("../services/fixtureGenerator");
    try {
      await generateFixturesForLeague(leagueId);
      // Update the fixturesGenerated flag after successful generation
      await league.update({ fixturesGenerated: true });
    } catch (genErr) {
      console.error("[startLeague] Fixture generation failed:", genErr);
      // We still keep it active, but warn the user
      return res.json({
        success: true,
        data: league,
        warning: "League started but fixture generation failed: " + genErr.message,
        message: "League started. Please generate fixtures manually."
      });
    }

    await clearLeagueCache(leagueId);
    res.json({
      success: true,
      data: league,
      message: "League started successfully. Round 1 fixtures are ready."
    });
  } catch (error) {
    console.error("startLeague error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Progress to next round
 * - Increments currentRound
 * - Generates fixtures for the next round if strategy is round_by_round
 */
exports.nextRound = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) return res.status(404).json({ success: false, error: "Organization not found" });

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id }
    });

    if (!league || league.status !== "active") {
      return res.status(400).json({ success: false, error: "League not found or not active" });
    }

    // Requirement: ONLY allow next round if all matches in CURRENT round are completed
    const { Fixture } = require("../models");
    const pendingMatches = await Fixture.count({
      where: {
        leagueId: leagueId,
        round: league.currentRound,
        status: { [Op.notIn]: ['completed', 'bye', 'walkover'] },
        // A match against TBD in Swiss is a Bye - it shouldn't block advancement if it's just awaiting pairing
        // or actually a Bye slot. We only want to block if there are REAL players with pending results.
        player1Id: { [Op.ne]: null },
        player2Id: { [Op.ne]: null }
      }
    });

    if (pendingMatches > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot progress to next round. There are ${pendingMatches} pending matches in the current round.`
      });
    }

    const nextRound = league.currentRound + 1;
    await league.update({ currentRound: nextRound });

    // Handle round-by-round generation AND knockout advancement repair
    const { generateNextLeagueRound, advanceKnockoutWinner } = require("../services/fixtureGenerator");

    if (league.format === 'knockout' || league.format === 'groupsKnockout') {
      try {
        console.log(`[nextRound] Running global knockout repair for league ${leagueId}`);
        const { repairLeagueKnockoutAdvancement } = require("../services/fixtureGenerator");
        await repairLeagueKnockoutAdvancement(leagueId);
      } catch (repairErr) {
        console.error("[nextRound] Repair phase error:", repairErr);
      }
    }

    const isSwiss = league.format === 'swiss';
    if (league.fixtureStrategy === 'round_by_round' || isSwiss) {
      try {
        await generateNextLeagueRound(leagueId, nextRound);
      } catch (genErr) {
        return res.status(400).json({ success: false, error: "Failed to generate next round: " + genErr.message });
      }
    }

    await clearLeagueCache(leagueId);
    res.json({
      success: true,
      data: { currentRound: nextRound },
      message: `Progressed to Round ${nextRound}`
    });
  } catch (error) {
    console.error("nextRound error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Seed the Knockout Bracket from Group Stage Standings
 */
exports.advanceToKnockout = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const { Organization, League } = require("../models");

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) return res.status(404).json({ success: false, error: "Organization not found" });

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id }
    });

    if (!league || league.status !== "active") {
      return res.status(400).json({ success: false, error: "League not found or not active" });
    }

    const { seedGroupKnockoutQualifiers } = require("../services/fixtureGenerator");
    try {
      await seedGroupKnockoutQualifiers(leagueId);
      // Run global repair to propagate advancements (especially for byes)
      const { repairLeagueKnockoutAdvancement } = require("../services/fixtureGenerator");
      await repairLeagueKnockoutAdvancement(leagueId);
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    await clearLeagueCache(leagueId);
    res.json({
      success: true,
      data: { status: "knockout_seeded" },
      message: "Advanced to Knockout Bracket successfully"
    });
  } catch (error) {
    console.error("advanceToKnockout error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// WIZARD-SPECIFIC LEAGUE OPERATIONS
// ============================================

/**
 * Create wizard league (Step 1 - Basic Info only)
 * POST /api/leagues/wizard
 */
exports.createWizardLeague = async (req, res) => {
  try {
    const { userId } = req.user;
    let { basicInfo, uploadId } = req.body;

    console.log('[createWizardLeague] Received req.body:', JSON.stringify(req.body, null, 2));
    console.log('[createWizardLeague] basicInfo.venueIds:', basicInfo?.venueIds, 'type:', typeof basicInfo?.venueIds);

    // If an uploadId is provided, load the cached payload
    if (uploadId) {
      const key = `wizard_upload:${uploadId}`;
      const cached = await cache.get(key);
      if (!cached) {
        return res.status(404).json({ success: false, error: 'Upload not found or expired' });
      }
      try {
        const parsed = JSON.parse(cached);
        basicInfo = parsed.payload && parsed.payload.basicInfo ? parsed.payload.basicInfo : parsed.payload || basicInfo;
      } catch (e) {
        basicInfo = basicInfo || null;
      }
    }

    // Validate organization
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    // Allow creating draft leagues for unverified organizations while wizard is in-use.
    // If you want to enforce verification, re-enable the check below.
    // if (!organization.isVerified) {
    //   return res.status(403).json({ success: false, error: "Organization must be verified to create leagues" });
    // }

    // Validate basicInfo
    if (!basicInfo || !basicInfo.leagueName || !basicInfo.clubId || (!basicInfo.gameId && !basicInfo.gameName)) {
      return res.status(400).json({
        success: false,
        error: "Basic info with leagueName, clubId, and a valid Game selection is required",
      });
    }

    // A TO Z FIX: Resolve the real Game ID if the frontend sent a name instead of a UUID
    let resolvedGameId = basicInfo.gameId;
    let resolvedGameName = basicInfo.gameName;

    const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

    if (!resolvedGameId || !isUUID(resolvedGameId)) {
      const searchName = resolvedGameId || resolvedGameName;
      if (searchName) {
        const foundGame = await Game.findOne({
          where: sequelize.where(
            sequelize.fn('LOWER', sequelize.col('name')),
            String(searchName).toLowerCase().trim()
          )
        });
        if (foundGame) {
          resolvedGameId = foundGame.id;
          resolvedGameName = foundGame.name;
        }
      }
    }

    // Initialize default values for all wizard steps
    const defaultStructure = {
      format: "roundRobin",
      groups: { count: 1, teamsPerGroup: 4, qualifiers: 2 },
      divisions: {
        enabled: false,
        count: 1,
        promotions: 1,
        relegations: 1,
        manualOverride: false,
        assignmentMethod: "auto",
        assignedPlayers: [],
        maxPlayersPerDivision: [],
      },
      players: { max: 16, min: 2, rollingJoin: false, lateJoin: false },
      swiss: { rounds: 5, pairing: "swiss", tieBreak: "buchholz" },
      knockout: { seeding: "random", protection: false, manualOrder: [] },
    };

    const defaultMatchRules = {
      bestOf: "3",
      customFrames: null,
      scoreDetail: 'total_only',
      handicap: { enabled: false, type: "manual", dynamic: false, fixed: false },
      walkover: { rule: "autoBestOf", customScore: null, enabled: true },
    };

    const defaultPointsSystem = {
      win: 3,
      draw: 1,
      loss: 0,
      walkoverWin: 3,
      walkoverLoss: 0,
      bonuses: {
        whitewash: false,
        whitewashPoints: 1,
        breakOverX: false,
        breakValue: 50,
        breakPoints: 1,
        participation: false,
        participationValue: 1,
      },
    };

    const defaultScheduling = {
      generation: "auto",
      deadlineDays: 7,
      autoForfeit: false,
      allowReschedule: true,
    };

    const defaultReporting = {
      method: "bothConfirm",
      adminApproval: false,
      photoProof: true,
      dispute: { enabled: true, timeLimit: 48 },
    };

    const defaultAdvanced = {
      withdrawal: "voidAll",
      seasonEnd: "archive",
      carryRanking: false,
      resetStats: true,
      keepLifetime: true,
      adminEditFixtures: false,
      adminEditResults: false,
      adminOverrideStandings: false,
      registration: { max: null, waitlist: false, autoAccept: true, entryFee: null },
    };

    // Determine which organization should own the league.
    // Prefer the club's organization when a clubId is provided (legacy flows), otherwise use the logged-in user's organization.
    let owningOrganizationId = organization.id;
    if (basicInfo?.clubId) {
      try {
        const { Club } = require('../models');
        const club = await Club.findByPk(basicInfo.clubId);
        if (club && club.organizationId) {
          // Only allow using the club's organization if it matches the logged-in user's organization
          // or if the user is a super admin
          if (club.organizationId === organization.id || role === 'super_admin') {
            owningOrganizationId = club.organizationId;
          } else {
            console.warn(`createWizardLeague: club ${basicInfo.clubId} belongs to different organization (${club.organizationId}); using logged-in organization ${organization.id} instead.`);
          }
        }
      } catch (clubErr) {
        console.warn('Failed to resolve club organization for league ownership:', clubErr && clubErr.message ? clubErr.message : clubErr);
      }
    }

    // Create league - allow using fields from basicInfo or the full uploaded payload
    const leaguePayload = {
      organizationId: owningOrganizationId,
      seasonId: basicInfo?.gameSeasonId || null,
      name: basicInfo?.leagueName || 'Untitled League',
      sport: determineSportFromGameName(basicInfo?.gameName),
      status: 'draft',
      clubId: basicInfo?.clubId || null,
      clubName: basicInfo?.clubName || null,
      venueIds: basicInfo?.venueIds || null,
      // persist selected venue owner (if provided)
      venueOwnerId: basicInfo?.venueOwnerId || null,
      gameId: resolvedGameId || basicInfo?.gameId || null,
      gameName: resolvedGameName || basicInfo?.gameName || null,
      gameSeasonId: basicInfo?.gameSeasonId || null,
      visibility: basicInfo?.visibility || 'public',
      registrationOpen: basicInfo?.registrationOpen || null,
      registrationClose: basicInfo?.registrationClose || null,
      leagueStartDate: basicInfo?.leagueStartDate || basicInfo?.seasonStart || null,
      leagueEndDate: basicInfo?.leagueEndDate || basicInfo?.seasonEnd || null,
      basicInfo,
      structure: defaultStructure,
      matchRules: defaultMatchRules,
      pointsSystem: defaultPointsSystem,
      tieBreakPriority: [
        'headToHead', 'frameDifference', 'framesWon', 'highestBreak', 'wins', 'winPercentage', 'random'
      ],
      standingsDisplay: { columns: ['matchesPlayed', 'wins', 'losses', 'draws', 'framesWon', 'framesConceded', 'frameDifference', 'whitewashes', 'highestBreak', 'winPercent', 'streak', 'walkoverWins', 'walkoverLosses'] },
      scheduling: defaultScheduling,
      reporting: defaultReporting,
      advanced: defaultAdvanced,
      leagueType: basicInfo?.leagueType || 'fixed',
      joinAllowed: basicInfo?.joinAllowed !== undefined ? basicInfo.joinAllowed : true,
      lateJoinAllowed: basicInfo?.lateJoinAllowed !== undefined ? basicInfo.lateJoinAllowed : false,
      format: defaultStructure.format,
      maxPlayers: defaultStructure.players.max,
      minPlayers: defaultStructure.players.min,
      fixturesGenerated: false,
      joinCode: await generateJoinCode(),
      generalInviteToken: uuidv4(),
    };

    console.log('[createWizardLeague] League payload venueIds:', leaguePayload.venueIds, 'type:', typeof leaguePayload.venueIds);

    const league = await League.create(leaguePayload);
    await clearLeagueCache();

    console.log('[createWizardLeague] League created with ID:', league.id);
    console.log('[createWizardLeague] Stored league.venueIds:', league.venueIds, 'type:', typeof league.venueIds);

    // ===== MULTI-VENUE APPROVAL LOGIC (Step 1) =====
    let venueIdsToProcess = [];
    if (league.venueIds) {
      try {
        venueIdsToProcess = typeof league.venueIds === 'string' ? JSON.parse(league.venueIds) : league.venueIds;
      } catch (e) {
        console.warn('[createWizardLeague] Failed to parse league.venueIds JSON:', e.message);
        venueIdsToProcess = Array.isArray(league.venueIds) ? league.venueIds : [];
      }
    }
    const approvalResults = [];
    const venueErrorsToReportLater = [];

    for (const vId of venueIdsToProcess) {
      try {
        const result = await processVenueApproval(league, organization, vId, userId);
        approvalResults.push({ venueId: vId, ...result });
      } catch (err) {
        console.error(`[createWizardLeague] Error processing venue approval for ${vId}:`, err.message || err);

        // Validation errors should block league creation
        if (err.message.includes("select a legacy club venue") ||
          err.message.includes("approval was rejected") ||
          err.message.includes("Venue not found")) {
          return res.status(400).json({ success: false, error: err.message });
        }

        // Other errors are tracked but don't block creation (league is draft)
        // User will see manual warning when they activate
        venueErrorsToReportLater.push({ venueId: vId, error: err.message });
        approvalResults.push({ venueId: vId, requiresApproval: false, isPendingApproval: false, error: err.message });
      }
    }

    const firstPending = approvalResults.find(r => r.isPendingApproval);
    const hasErrors = venueErrorsToReportLater.length > 0;

    if (firstPending) {
      const responseData = {
        success: true,
        data: league,
        message: "Draft league created successfully. Some selected venues require approval. You cannot activate this league until all venue owners approve.",
        requiresApproval: true,
        pendingVenues: approvalResults.filter(r => r.isPendingApproval).map(r => r.venueId),
        venueApprovalStatus: approvalResults.map(r => ({
          venueId: r.venueId,
          status: r.isPendingApproval ? 'pending' : 'approved',
          error: r.error || null
        }))
      };

      if (hasErrors) {
        responseData.warnings = venueErrorsToReportLater;
      }

      return res.status(201).json(responseData);
    }

    const responseData = {
      success: true,
      data: league,
      message: "Draft league created successfully",
    };

    if (hasErrors) {
      responseData.warnings = venueErrorsToReportLater;
      responseData.message += ` (${hasErrors} venue(s) had issues with email notification)`;
    }

    console.log('[createWizardLeague] Response league.venueIds:', league.venueIds, 'type:', typeof league.venueIds);
    console.log('[createWizardLeague] Sending response with league:', JSON.stringify({ id: league.id, name: league.name, venueIds: league.venueIds }, null, 2));

    res.status(201).json(responseData);
  } catch (error) {
    console.error("createWizardLeague error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Update wizard league (any step)
 * PATCH /api/leagues/wizard/:leagueId
 */
exports.updateWizardLeague = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const updates = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id },
    });

    if (!league) {
      return res.status(404).json({
        success: false,
        error: "League not found or not owned by your organization",
      });
    }

    // Don't allow updates if league is active (except certain fields like joinAllowed and lateJoinAllowed)
    if (league.status === "active") {
      const allowedActiveFields = ['joinAllowed', 'lateJoinAllowed', 'leagueType'];
      const updateFields = Object.keys(updates.basicInfo || {});
      const invalidFields = updateFields.filter(f => !allowedActiveFields.includes(f));

      // If they are trying to update something else, block it
      if (invalidFields.length > 0 && (updates.structure || updates.matchRules || updates.pointsSystem || updates.scheduling)) {
        return res.status(400).json({
          success: false,
          error: "Cannot update core configuration for active leagues. Only join settings can be modified.",
        });
      }
    }

    // Validation based on updates
    const errors = validateWizardUpdates(updates, league);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors,
      });
    }

    // Merge updates with existing data
    // safeJSON: always returns a plain object even if the DB field is stored as a JSON string.
    // Also strips out numeric-string keys ("0","1","2"...) that result from previously spreading
    // a string into an object — cleans up any already-corrupted records on the next wizard save.
    const safeJSON = (val) => {
      let obj = {};
      if (!val) return obj;
      if (typeof val === 'string') {
        try { obj = JSON.parse(val); } catch { return obj; }
      } else if (typeof val === 'object' && !Array.isArray(val)) {
        obj = val;
      } else {
        return obj;
      }
      // Remove numeric-string keys produced by accidental string spreading
      return Object.fromEntries(
        Object.entries(obj).filter(([k]) => isNaN(Number(k)))
      );
    };
    const updateData = {};

    if (updates.basicInfo) {
      updateData.basicInfo = { ...safeJSON(league.basicInfo), ...updates.basicInfo };
      if (updates.basicInfo.leagueName) updateData.name = updates.basicInfo.leagueName;
      if (updates.basicInfo.clubId) updateData.clubId = updates.basicInfo.clubId;
      if (updates.basicInfo.clubName) updateData.clubName = updates.basicInfo.clubName;

      if (updates.basicInfo.venueIds) {
        updateData.venueIds = updates.basicInfo.venueIds;
      }

      // A TO Z FIX: Resolve the real Game ID during updates
      if (updates.basicInfo.gameId || updates.basicInfo.gameName) {
        let updateGameId = updates.basicInfo.gameId;
        let updateGameName = updates.basicInfo.gameName;

        const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

        if (updateGameId && !isUUID(updateGameId)) {
          const foundGame = await Game.findOne({
            where: sequelize.where(
              sequelize.fn('LOWER', sequelize.col('name')),
              String(updateGameId).toLowerCase().trim()
            )
          });
          if (foundGame) {
            updateGameId = foundGame.id;
            updateGameName = foundGame.name;
          }
        } else if (!updateGameId && updateGameName) {
          const foundGame = await Game.findOne({
            where: sequelize.where(
              sequelize.fn('LOWER', sequelize.col('name')),
              String(updateGameName).toLowerCase().trim()
            )
          });
          if (foundGame) {
            updateGameId = foundGame.id;
          }
        }

        if (updateGameId) updateData.gameId = updateGameId;
        if (updateGameName) {
          updateData.gameName = updateGameName;
          updateData.sport = determineSportFromGameName(updateGameName);
        }
      }
      if (updates.basicInfo.gameSeasonId) {
        updateData.gameSeasonId = updates.basicInfo.gameSeasonId;
        updateData.seasonId = updates.basicInfo.gameSeasonId;
      }
      if (updates.basicInfo.visibility) updateData.visibility = updates.basicInfo.visibility;
      if (updates.basicInfo.registrationOpen) updateData.registrationOpen = updates.basicInfo.registrationOpen;
      if (updates.basicInfo.registrationClose) updateData.registrationClose = updates.basicInfo.registrationClose;
      if (updates.basicInfo.seasonStart) updateData.leagueStartDate = updates.basicInfo.seasonStart;
      if (updates.basicInfo.seasonEnd) updateData.leagueEndDate = updates.basicInfo.seasonEnd;
      if (updates.basicInfo.leagueType) updateData.leagueType = updates.basicInfo.leagueType;
      if (updates.basicInfo.joinAllowed !== undefined) updateData.joinAllowed = updates.basicInfo.joinAllowed;
      if (updates.basicInfo.lateJoinAllowed !== undefined) updateData.lateJoinAllowed = updates.basicInfo.lateJoinAllowed;
    }

    if (updates.structure) {
      updateData.structure = { ...safeJSON(league.structure), ...updates.structure };

      // Sync player settings from structure to top-level columns
      if (updates.structure.players) {
        if (updates.structure.players.max !== undefined) updateData.maxPlayers = updates.structure.players.max;
        if (updates.structure.players.min !== undefined) updateData.minPlayers = updates.structure.players.min;

        // If late join is enabled, automatically enable rolling join
        let isRolling = updates.structure.players.rollingJoin;
        if (updates.structure.players.lateJoin && !updates.structure.players.rollingJoin) {
          console.log('[updateLeague] Late join enabled without rolling - automatically enabling rolling join');
          isRolling = true;
          updates.structure.players.rollingJoin = true; // Update the structure data too
        }

        if (isRolling !== undefined) {
          updateData.leagueType = isRolling ? 'rolling' : 'fixed';
        }

        if (updates.structure.players.lateJoin !== undefined) {
          updateData.lateJoinAllowed = updates.structure.players.lateJoin;
        }
      }

      // Sync format if it changed
      if (updates.structure.format) {
        updateData.format = updates.structure.format;
      }
    }

    if (updates.matchRules) {
      updateData.matchRules = { ...safeJSON(league.matchRules), ...updates.matchRules };
    }

    if (updates.pointsSystem) {
      updateData.pointsSystem = { ...safeJSON(league.pointsSystem), ...updates.pointsSystem };
    }

    if (updates.tieBreakPriority) {
      updateData.tieBreakPriority = updates.tieBreakPriority;
    }

    if (updates.standingsDisplay) {
      updateData.standingsDisplay = { ...safeJSON(league.standingsDisplay), ...updates.standingsDisplay };
    }

    if (updates.scheduling) {
      updateData.scheduling = { ...safeJSON(league.scheduling), ...updates.scheduling };
    }

    if (updates.reporting) {
      const existingReporting = league.reporting && typeof league.reporting === 'object' ? league.reporting : {};
      const mergedReporting = { ...existingReporting, ...updates.reporting };

      if (mergedReporting.method === 'admin') {
        mergedReporting.adminApproval = true;
      }

      updateData.reporting = mergedReporting;
    }

    if (updates.advanced) {
      updateData.advanced = { ...safeJSON(league.advanced), ...updates.advanced };
    }

    await league.update(updateData);
    await clearLeagueCache();

    // NEW: Handle roster updates (leaguePlayers) if provided
    if (updates.leaguePlayers && Array.isArray(updates.leaguePlayers)) {
      console.log(`[updateWizardLeague] Updating roster for league ${leagueId} with ${updates.leaguePlayers.length} players`);
      const { LeaguePlayer } = require('../models');
      for (const p of updates.leaguePlayers) {
        const pId = p.playerId || p.id;
        if (pId && !String(pId).startsWith('temp-')) {
          try {
            // Check if player already exists in this league
            const existing = await LeaguePlayer.findOne({ where: { leagueId: league.id, playerId: pId } });
            if (!existing) {
              await LeaguePlayer.create({
                leagueId: league.id,
                playerId: pId,
                status: "active",
                approvalStatus: "approved",
                enrollmentDate: new Date()
              });
            }
          } catch (lpErr) {
            console.error(`[updateWizardLeague] Failed to add player ${pId}:`, lpErr.message);
          }
        }
      }
    }

    // ===== MULTI-VENUE APPROVAL LOGIC (Step 1 Update) =====
    const venueIdsUpdate = updates.venueIds || (updates.basicInfo && updates.basicInfo.venueIds);
    if (venueIdsUpdate) {
      let vIds = [];
      try {
        vIds = typeof venueIdsUpdate === 'string' ? JSON.parse(venueIdsUpdate) : venueIdsUpdate;
        if (!Array.isArray(vIds)) vIds = [vIds];
      } catch (e) {
        vIds = Array.isArray(venueIdsUpdate) ? venueIdsUpdate : [venueIdsUpdate];
      }

      for (const vId of vIds) {
        try {
          await processVenueApproval(league, organization, vId, userId);
        } catch (err) {
          console.error(`[updateWizardLeague] Error processing venue update for ${vId}:`, err);
        }
      }
    }

    res.json({
      success: true,
      data: league,
      message: "League updated successfully",
    });
  } catch (error) {
    console.error("updateWizardLeague error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Activate wizard league
 * POST /api/leagues/wizard/:leagueId/activate
 */
exports.activateWizardLeague = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const { venueOwnerId } = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id },
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    // Allow re-activation if it's already active but has NO fixtures (failed generation previously)
    if (league.status !== "draft" && league.status !== "active") {
      return res.status(400).json({
        success: false,
        error: "Only draft leagues can be activated",
      });
    }

    if (league.status === "active") {
      const existingFixturesCount = await Fixture.count({ where: { leagueId } });
      if (league.fixturesGenerated && existingFixturesCount > 0) {
        return res.status(200).json({
          success: true,
          message: "League is already active and fixtures are generated",
          data: league
        });
      }
      console.log(`[activateWizardLeague] Re-running activation for active league ${league.id} with no fixtures.`);
    }

    // Synchronize settings from structure to top-level columns before activation
    let structure = league.structure;
    if (typeof structure === 'string') {
      try { structure = JSON.parse(structure); } catch { structure = {}; }
    }

    const updates = {};
    if (structure && structure.players) {
      if (structure.players.max !== undefined) updates.maxPlayers = structure.players.max;
      if (structure.players.min !== undefined) updates.minPlayers = structure.players.min;

      // If late join is enabled, automatically enable rolling join
      let isRolling = structure.players.rollingJoin;
      if (structure.players.lateJoin && !structure.players.rollingJoin) {
        console.log('[activateWizardLeague] Late join enabled without rolling - automatically enabling rolling join');
        isRolling = true;
      }

      if (isRolling !== undefined) {
        updates.leagueType = isRolling ? 'rolling' : 'fixed';
      }

      if (structure.players.lateJoin !== undefined) {
        updates.lateJoinAllowed = structure.players.lateJoin;
      }
      // Ensure joinAllowed is true if rolling or late join is enabled
      if (isRolling || structure.players.lateJoin) {
        updates.joinAllowed = true;
      }
    }

    // Ensure sport is set
    let activeSport = league.sport;
    if (!activeSport) {
      activeSport = determineSportFromGameName(league.gameName || league.basicInfo?.gameName);
      if (activeSport) updates.sport = activeSport;
    }

    if (Object.keys(updates).length > 0) {
      await league.update(updates);
    }

    // Full validation before activation
    const validationErrors = validateFullLeague(league);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "League validation failed",
        details: validationErrors,
      });
    }

    // Check minimum player count before activation
    const leaguePlayersCount = await LeaguePlayer.count({ where: { leagueId } });
    if (leaguePlayersCount < 2) {
      return res.status(400).json({
        success: false,
        error: "Cannot activate league: At least 2 players are required",
      });
    }

    // ===== ROBUST DIVISION SYNCHRONISATION & PLAYER ASSIGNMENT =====
    const normalizedSport = String(league.sport).toLowerCase();
    if (normalizedSport === "snooker" || normalizedSport === "pool" || normalizedSport === "pooker") {
      let structure = league.structure;
      if (typeof structure === 'string') {
        try { structure = JSON.parse(structure); } catch { structure = {}; }
      }

      const divSettings = structure?.divisions || {};
      const isGroupsKnockout = structure?.format === 'groupsKnockout';
      const groupsConfig = structure?.groups || {};

      if (divSettings.enabled || isGroupsKnockout) {
        const groupsCount = isGroupsKnockout
          ? (parseInt(groupsConfig.count, 10) || 1)
          : (parseInt(divSettings.count, 10) || 1);

        const assignmentMethod = isGroupsKnockout
          ? (groupsConfig.assignmentMethod || 'auto')
          : (divSettings.assignmentMethod || 'auto');

        // Find existing divisions
        let divisions = await Division.findAll({ where: { leagueId: league.id } });

        // If no divisions exist, create them automatically
        if (divisions.length === 0) {
          console.log(`Auto‑creating ${groupsCount} divisions for league ${league.id}`);

          let bestOfNumber = 5;
          if (structure.matchRules?.bestOf) {
            if (structure.matchRules.bestOf === 'custom') {
              bestOfNumber = structure.matchRules.customFrames || 5;
            } else {
              bestOfNumber = parseInt(structure.matchRules.bestOf, 10) || 5;
            }
          }

          const createdDivs = [];
          for (let i = 1; i <= groupsCount; i++) {
            const divisionName = groupsCount === 1 ? "Division 1" : `Group ${String.fromCharCode(64 + i)}`;
            const divisionPayload = {
              leagueId: league.id,
              name: divisionName,
              maxPlayers: isGroupsKnockout ? (groupsConfig.teamsPerGroup || null) : (divSettings.maxPlayersPerDivision?.[i - 1] || null),
              status: 'active',
            };

            if (String(league.sport).toLowerCase() === 'snooker' || String(league.sport).toLowerCase() === 'pooker') divisionPayload.numberOfFrames = bestOfNumber;
            else if (String(league.sport).toLowerCase() === 'pool') divisionPayload.raceLength = bestOfNumber;

            const newDiv = await Division.create(divisionPayload);
            createdDivs.push(newDiv);
          }
          divisions = createdDivs;
        }

        // Fetch all players in league
        const leaguePlayers = await LeaguePlayer.findAll({
          where: { leagueId: league.id },
          include: [{ association: 'player', attributes: ['id', 'name', 'nickname'] }]
        });

        if (leaguePlayers.length > 0 && divisions.length > 0) {
          console.log(`Assigning ${leaguePlayers.length} players to ${divisions.length} divisions using ${assignmentMethod} method`);

          if (assignmentMethod === 'skill') {
            // Sort players by ranking DESC (assuming higher ranking/rating is better)
            const sortedPlayers = [...leaguePlayers].sort((a, b) => {
              const rA = a.ranking || 0;
              const rB = b.ranking || 0;
              return rB - rA;
            });

            // Distribute into divisions
            for (let i = 0; i < sortedPlayers.length; i++) {
              const divIdx = i % divisions.length;
              await sortedPlayers[i].update({ divisionId: divisions[divIdx].id });
            }
          } else if (assignmentMethod === 'manual' && (divSettings.assignedPlayers || groupsConfig.assignedPlayers)) {
            // Respect manual assignments from wizard structure object
            const manualAssignedList = isGroupsKnockout ? groupsConfig.assignedPlayers : divSettings.assignedPlayers;
            for (let di = 0; di < divisions.length; di++) {
              const assignedIds = manualAssignedList[di] || [];
              if (assignedIds.length > 0) {
                // Ensure IDs are mapped correctly (could be player info or just IDs)
                const ids = assignedIds.map(id => typeof id === 'object' ? (id.id || id.playerId) : id).filter(Boolean);
                if (ids.length > 0) {
                  await LeaguePlayer.update(
                    { divisionId: divisions[di].id, manuallyAssigned: true },
                    { where: { leagueId: league.id, playerId: { [Op.in]: ids } } }
                  );
                }
              }
            }
          } else {
            // Default: Auto / Round-robin distribution
            for (let i = 0; i < leaguePlayers.length; i++) {
              const divIdx = i % divisions.length;
              await leaguePlayers[i].update({ divisionId: divisions[divIdx].id });
            }
          }
        }
      }
    }

    // ===== AUTO‑GENERATE FIXTURES =====
    activeSport = league.sport;
    if (!activeSport) {
      activeSport = determineSportFromGameName(league.gameName || league.basicInfo?.gameName);
      if (activeSport !== league.sport) {
        league.sport = activeSport;
        await league.save();
      }
    }

    if (activeSport === "snooker" || activeSport === "pool" || activeSport === "pooker") {
      // Always attempt to generate fixtures if not already present
      console.log(`Attempting fixture generation for ${activeSport} league ${league.id}`);
      let fixturesFailed = false;
      try {
        await generateFixturesForLeague(league.id);
        // Persist the fixturesGenerated flag after successful generation
        await league.update({ fixturesGenerated: true });
        console.log(`[activateWizardLeague] Fixtures generated and fixturesGenerated flag updated for league ${league.id}`);
      } catch (genError) {
        fixturesFailed = true;
        console.error("Auto‑generation of fixtures failed:", genError);
      }
      league._fixturesGenerationFailed = fixturesFailed;
    }

    // ===== MULTI-VENUE APPROVAL LOGIC =====
    const venueIds = Array.isArray(league.venueIds) ? league.venueIds : [];
    const { LeagueVenueRequest, VenueOwner } = require("../models");

    if (venueIds.length > 0) {
      const pendingVenues = [];
      const rejectedVenues = [];

      for (const vId of venueIds) {
        // Skip club venue format (cannot require approval via LeagueVenueRequest)
        if (typeof vId === 'string' && vId.includes(':')) continue;

        // IMPORTANT: vId is the venue identifier (string name), not the owner ID!
        // We need to query by venueId field, not venueOwnerId field
        const existingApproval = await LeagueVenueRequest.findOne({
          where: {
            leagueId: league.id,
            venueId: vId  // ✅ Fixed: Query by venueId (the identifier), not venueOwnerId (UUID)
          },
          order: [['createdAt', 'DESC']],
        });

        if (existingApproval) {
          if (existingApproval.status === "pending") pendingVenues.push(vId);
          else if (existingApproval.status === "rejected") rejectedVenues.push(vId);
        } else {
          // Check if this venue is owned by the current organization
          const vOwner = await VenueOwner.findByPk(vId);
          if (vOwner && vOwner.organizationId !== organization.id) {
            // Should have a request but doesn't
            pendingVenues.push(vId);
          }
        }
      }

      if (rejectedVenues.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Activation blocked: Approval for some venues has been rejected.`,
          rejectedVenues
        });
      }

      if (pendingVenues.length > 0) {
        return res.status(400).json({
          success: false,
          error: "Venue approval is still pending for some selected venues. You cannot activate this league until all venue owners approve your request.",
          pendingVenues
        });
      }
    }

    // Final check for the singular venueOwnerId if provided in body
    const finalVenueOwnerId = venueOwnerId || league.venueOwnerId;
    let finalVenueApprovalRequestId = league.venueApprovalRequestId;

    // If multi-venue is used, we might want to link to the first pending/approved request for legacy UI support
    if (venueIds.length > 0 && !finalVenueApprovalRequestId) {
      const firstReq = await LeagueVenueRequest.findOne({
        where: { leagueId: league.id },
        order: [['createdAt', 'DESC']]
      });
      if (firstReq) finalVenueApprovalRequestId = firstReq.id;
    }

    // Update league status to registration_open
    await league.update({
      status: "registration_open",
      venueOwnerId: finalVenueOwnerId,
      venueApprovalRequestId: finalVenueApprovalRequestId,
    });
    await clearLeagueCache();

    // Build response
    const responsePayload = { success: true, data: league, message: "League activated and registration opened successfully" };
    if (league._fixturesGenerationFailed) {
      responsePayload.warning = "Fixtures generation failed automatically. Please generate fixtures manually from the Fixtures page.";
    }

    res.json(responsePayload);
  } catch (error) {
    console.error("activateWizardLeague error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Get clubs for organization (for wizard dropdown)
 * GET /api/leagues/wizard/clubs
 */
exports.getWizardClubs = async (req, res) => {
  try {
    const { userId } = req.user;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const { Club } = require("../models");
    const clubs = await Club.findAll({
      where: { organizationId: organization.id, status: "active" },
      attributes: ["id", "name", "venues", "sportTypes"],
    });

    // Transform to match frontend format
    const clubsData = clubs.map((club) => ({
      id: club.id,
      name: club.name,
      venues: club.venues || [],
      games: club.sportTypes || [],
    }));

    res.json({
      success: true,
      data: clubsData,
    });
  } catch (error) {
    console.error("getWizardClubs error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Get seasons for a game
 * GET /api/leagues/wizard/games/:gameName/seasons
 */
exports.getGameSeasons = async (req, res) => {
  try {
    const { userId } = req.user;
    const { gameName } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const { Game, Season } = require("../models");

    // Find game by ID or name (Case-Insensitive)
    const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

    const game = isUUID(gameName)
      ? await Game.findByPk(gameName)
      : await Game.findOne({
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('name')),
          String(gameName).toLowerCase().trim()
        ),
      });

    if (!game) {
      return res.status(404).json({ success: false, error: "Game not found" });
    }

    // Get active seasons for this game and organization (filtered for wizard creation)
    const seasons = await Season.findAll({
      where: {
        gameId: game.id,
        organizationId: organization.id,
        status: "active",
      },
      attributes: ["id", "name", "startDate", "endDate", "status"],
      order: [["startDate", "DESC"]],
    });

    res.json({
      success: true,
      data: seasons,
    });
  } catch (error) {
    console.error("getGameSeasons error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

// ============================================
// VALIDATION HELPERS
// ============================================

function validateWizardUpdates(updates, league) {
  const errors = [];

  // Step 1: Basic Info validation
  if (updates.basicInfo) {
    const { registrationOpen, registrationClose, seasonStart, seasonEnd } = updates.basicInfo;

    if (registrationOpen && registrationClose) {
      if (new Date(registrationClose) <= new Date(registrationOpen)) {
        errors.push("Registration close must be after registration open");
      }
    }

    if (seasonStart && registrationClose) {
      if (new Date(seasonStart) < new Date(registrationClose)) {
        errors.push("Season start must be after registration close");
      }
    }

    if (seasonStart && seasonEnd) {
      if (new Date(seasonEnd) <= new Date(seasonStart)) {
        errors.push("Season end must be after season start");
      }
    }
  }

  // Step 2: Structure validation
  if (updates.structure) {
    const structure = { ...league.structure, ...updates.structure };

    if (structure.players) {
      if (structure.players.min < 2) {
        errors.push("Minimum players must be at least 2");
      }
      if (structure.players.min > structure.players.max) {
        errors.push("Minimum players cannot exceed maximum");
      }
    }

    if (structure.format === "groupsKnockout" && structure.groups) {
      if (structure.groups.qualifiers > structure.groups.teamsPerGroup) {
        errors.push("Qualifiers cannot exceed teams per group");
      }
    }

    if (structure.format === "swiss" && structure.swiss) {
      if (structure.swiss.rounds < 3) {
        errors.push("Swiss format requires at least 3 rounds");
      }
    }

    if (structure.divisions && structure.divisions.enabled) {
      const { promotions, relegations, maxPlayersPerDivision, assignmentMethod, assignedPlayers } = structure.divisions;

      if (promotions + relegations > 2) {
        errors.push("Promotions + relegations too high");
      }

      if (maxPlayersPerDivision && maxPlayersPerDivision.length > 0) {
        const totalMaxPlayers = maxPlayersPerDivision.reduce((sum, val) => sum + (val || 0), 0);
        if (structure.players && totalMaxPlayers > structure.players.max) {
          errors.push("Sum of max players per division exceeds total max players");
        }
      }

      // Validate manual assignment
      if (assignmentMethod === 'manual') {
        if (!assignedPlayers || !Array.isArray(assignedPlayers)) {
          errors.push("Manual assignment requires assignedPlayers array");
        } else {
          // Check that assignedPlayers is an array of arrays
          for (let i = 0; i < assignedPlayers.length; i++) {
            if (!Array.isArray(assignedPlayers[i])) {
              errors.push(`Division ${i + 1} assignedPlayers must be an array`);
            }
          }
        }
      }
    }

    // ====== Knockout seeding validation ======
    if (structure.format === 'knockout' && structure.knockout) {
      const { seeding, protection, manualOrder } = structure.knockout;
      const allowed = ['random', 'ranking', 'manual'];
      if (seeding && !allowed.includes(seeding)) {
        errors.push('Invalid knockout seeding method');
      }
      if (seeding === 'manual') {
        if (!manualOrder || !Array.isArray(manualOrder)) {
          errors.push('Manual seeding requires manualOrder array');
        } else {
          const set = new Set(manualOrder);
          if (set.size !== manualOrder.length) {
            errors.push('Manual seeding list contains duplicates');
          }
        }
      }
      if (protection !== undefined && typeof protection !== 'boolean') {
        errors.push('Knockout protection flag must be boolean');
      }
    }

    // Conflict detection (Relaxed: allow divisions in knockout if user wants to group them)
    /*
    if (structure.divisions && structure.divisions.enabled && structure.format === "knockout") {
      errors.push("Divisions and knockout format are incompatible");
    }
    */


    if (structure.players && structure.players.lateJoin && structure.format === "knockout") {
      errors.push("Late join not allowed in knockout format");
    }

    if (structure.players && structure.players.rollingJoin && structure.scheduling && structure.scheduling.generation === "weekly") {
      errors.push("Rolling join conflicts with fixed weekly schedule");
    }
  }

  // Step 3: Match Rules validation
  if (updates.matchRules) {
    const { bestOf, customFrames, walkover } = updates.matchRules;

    if (bestOf && bestOf !== "custom") {
      const num = parseInt(bestOf, 10);
      if (num % 2 === 0) {
        errors.push("Best Of must be an odd number");
      }
    } else if (bestOf === "custom" && customFrames) {
      if (customFrames % 2 === 0) {
        errors.push("Custom frames must be odd");
      }
    }

    // Validate walkover rule - only allow autoBestOf and admin
    if (walkover && walkover.rule) {
      const allowedWalkoverRules = ['autoBestOf', 'admin'];
      if (!allowedWalkoverRules.includes(walkover.rule)) {
        errors.push(`Invalid walkover rule. Allowed values are: ${allowedWalkoverRules.join(', ')}`);
      }
    }
  }

  // Step 6: Scheduling validation
  if (updates.scheduling) {
    if (updates.scheduling.deadlineDays && updates.scheduling.deadlineDays < 1) {
      errors.push("Deadline must be at least 1 day");
    }
  }

  return errors;
}

/**
 * Get sorted league standings
 * GET /api/leagues/:leagueId/standings
 */
exports.getLeagueStandings = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { divisionId } = req.query;

    const league = await League.findByPk(leagueId);
    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    const standings = await standingsService.getSortedStandings(leagueId, divisionId);

    // Return both standings data and display configuration
    res.json({
      success: true,
      data: {
        standings: standings,
        standingsDisplay: league.standingsDisplay || {
          columns: ['matchesPlayed', 'wins', 'losses', 'draws', 'framesWon', 'framesConceded', 'frameDifference', 'whitewashes', 'highestBreak', 'winPercent', 'streak', 'points']
        }
      },
      message: "League standings retrieved successfully"
    });
  } catch (error) {
    console.error("getLeagueStandings error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Finalize a league: set status to "completed", finalize standings, then
 * apply promotion/relegation between divisions.
 * POST /api/leagues/:leagueId/finalize
 */
exports.finalizeLeague = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id },
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    if (league.status === "cancelled") {
      return res.status(400).json({ success: false, error: "Cannot finalize a cancelled league" });
    }

    // 1. Update standings one last time so they are accurate
    await standingsService.updateLeagueStandings(leagueId);

    // 2. Apply promotion/relegation
    const { processPromotionRelegation } = require('../services/divisionService');
    const { moves } = await processPromotionRelegation(leagueId);

    // 3. Mark league as completed
    await league.update({ status: "completed" });

    // 4. Crown Champions for each division (Only for standings-based formats)
    try {
      const { Division } = require('../models');
      const divisions = await Division.findAll({ where: { leagueId } });

      const structure = typeof league.structure === 'string' ? JSON.parse(league.structure || '{}') : (league.structure || {});
      const format = structure.format || league.format;
      const isTournamentFormat = ['knockout', 'groupsKnockout'].includes(format);

      if (!isTournamentFormat) {
        if (divisions.length > 0) {
          for (const div of divisions) {
            const sorted = await standingsService.getSortedStandings(leagueId, div.id);
            if (sorted && sorted.length > 0) {
              await sorted[0].update({ title: 'Champion' });
              if (sorted.length > 1) await sorted[1].update({ title: 'Runner-up' });
            }
          }
        } else {
          // No divisions, crown overall champion
          const sorted = await standingsService.getSortedStandings(leagueId);
          if (sorted && sorted.length > 0) {
            await sorted[0].update({ title: 'Champion' });
            if (sorted.length > 1) await sorted[1].update({ title: 'Runner-up' });
          }
        }
      } else {
        console.log(`[finalizeLeague] Skipping automatic title assignment for tournament format: ${format}`);
      }
    } catch (crownErr) {
      console.warn(`[finalizeLeague] Failed to assign titles:`, crownErr.message);
    }

    await clearLeagueCache(leagueId);

    console.log(`[finalizeLeague] League ${leagueId} finalized with ${moves.length} player moves.`);

    res.json({
      success: true,
      data: {
        league,
        moves,
      },
      message: `League finalized. ${moves.length} player(s) were promoted or relegated.`,
    });
  } catch (error) {
    console.error("finalizeLeague error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

function validateFullLeague(league) {
  const errors = [];

  // Helper to safely parse JSON strings
  const tryParse = (val) => {
    if (val == null) return null;
    if (typeof val === 'object') return val;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch (e) { return null; }
    }
    return null;
  };

  // Normalize basicInfo: it might be stored as JSON string or as top-level fields
  const basicInfo = tryParse(league.basicInfo) || {
    leagueName: league.leagueName || league.name || (league.basicInfo && league.basicInfo.leagueName) || '',
    clubId: league.clubId || (league.basicInfo && league.basicInfo.clubId) || '',
    clubName: league.clubName || (league.basicInfo && league.basicInfo.clubName) || '',
    venueIds: (league.venueIds && (Array.isArray(league.venueIds) ? league.venueIds : tryParse(league.venueIds) || [])) || (league.basicInfo && league.basicInfo.venueIds) || [],
    gameId: league.gameId || (league.basicInfo && league.basicInfo.gameId) || '',
    gameName: league.gameName || (league.basicInfo && league.basicInfo.gameName) || '',
    gameSeasonId: league.gameSeasonId || (league.basicInfo && league.basicInfo.gameSeasonId) || '',
    visibility: league.visibility || (league.basicInfo && league.basicInfo.visibility) || 'public',
    registrationOpen: (league.basicInfo && league.basicInfo.registrationOpen) || league.registrationOpen || '',
    registrationClose: (league.basicInfo && league.basicInfo.registrationClose) || league.registrationClose || '',
    leagueStartDate: league.leagueStartDate || (league.basicInfo && league.basicInfo.leagueStartDate) || '',
    leagueEndDate: league.leagueEndDate || (league.basicInfo && league.basicInfo.leagueEndDate) || '',
  };

  // Check all required fields are present
  if (!basicInfo || !basicInfo.leagueName) {
    errors.push("League name is required");
  }

  if (!basicInfo || !basicInfo.clubId) {
    errors.push("Club is required");
  }

  if (!basicInfo || !basicInfo.gameId) {
    errors.push("Game is required");
  }

  // Run all update validations using normalized structures
  const struct = tryParse(league.structure) || league.structure || {};
  const matchRules = tryParse(league.matchRules) || league.matchRules || {};
  const scheduling = tryParse(league.scheduling) || league.scheduling || {};

  const updateErrors = validateWizardUpdates({
    basicInfo,
    structure: struct,
    matchRules,
    scheduling,
  }, { ...league, basicInfo, structure: struct, matchRules, scheduling });

  errors.push(...updateErrors);

  return errors;
}

/**
 * Override standings - manually adjust player points/rankings
 * POST /api/leagues/:leagueId/standings/override
 * Requires: adminOverrideStandings enabled in advanced settings
 */
exports.overrideStandings = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const { playerId, pointsAdjustment, reason } = req.body;

    // Validate request
    if (!playerId || pointsAdjustment === undefined || !reason) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: playerId, pointsAdjustment, reason"
      });
    }

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id }
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    // Check if admin override is allowed
    let advanced = league.advanced || {};
    if (typeof advanced === 'string') {
      try { advanced = JSON.parse(advanced); } catch (e) { advanced = {}; }
    }

    if (!advanced.adminOverrideStandings) {
      return res.status(403).json({
        success: false,
        error: "League rules prevent admin from overriding standings. Enable adminOverrideStandings in advanced settings."
      });
    }

    // Get the league player
    const leaguePlayer = await LeaguePlayer.findOne({
      where: { leagueId, playerId },
      include: [{ model: Player, as: 'player', attributes: ['name', 'nickname'] }]
    });

    if (!leaguePlayer) {
      return res.status(404).json({
        success: false,
        error: "Player not found in league"
      });
    }

    // Check if player has withdrawn
    if (leaguePlayer.status === 'withdrawn') {
      return res.status(400).json({
        success: false,
        error: "Cannot override standings for withdrawn players. This player has withdrawn from the league."
      });
    }

    // Store original points for audit
    const originalPoints = leaguePlayer.points;

    // FIX: Store manualPointsAdjustment as an ABSOLUTE override value (not cumulative).
    // The standings recalculation computes match-based points from scratch and adds
    // manualPointsAdjustment on top (see standingsService.js line 433).
    // If we accumulated adjustments, each call to updateLeagueStandings would
    // add the growing cumulative value on top of the fresh match-based total, causing
    // incorrect results. Instead, we REPLACE manualPointsAdjustment with the new value.
    const prevManualAdjustment = leaguePlayer.manualPointsAdjustment || 0;
    const newManualAdjustment = prevManualAdjustment + pointsAdjustment;

    // Persist the new override value
    await leaguePlayer.update({
      manualPointsAdjustment: newManualAdjustment
    });

    // Trigger a full standings recalculation so that:
    //   finalPoints = (match-based points) + newManualAdjustment
    // This ensures correctness regardless of how many matches have been played.
    const standingsService = require("../services/standingsService");
    await standingsService.updateLeagueStandings(leagueId);

    // Reload the player to get the freshly computed points from the recalculation
    await leaguePlayer.reload();
    const newPoints = leaguePlayer.points;

    // Create audit log
    const { AuditLog } = require("../models");
    await AuditLog.create({
      organizationId: organization.id,
      userId: userId,
      action: 'override_standings',
      resourceType: 'LeaguePlayer',
      resourceId: leaguePlayer.id,
      details: {
        leagueId: leagueId,
        leagueName: league.name,
        playerId: playerId,
        playerName: leaguePlayer.player?.name || leaguePlayer.player?.nickname,
        originalPoints: originalPoints,
        newPoints: newPoints,
        adjustment: pointsAdjustment,
        previousManualAdjustment: prevManualAdjustment,
        newManualAdjustment: newManualAdjustment,
        reason: reason,
        timestamp: new Date()
      },
      ipAddress: req.ip
    });

    console.log(`[overrideStandings] Admin ${userId} adjusted standings for player ${playerId} in league ${leagueId}: +${pointsAdjustment} adjustment (cumulative manual: ${newManualAdjustment}), final points: ${newPoints} (${reason})`);

    res.json({
      success: true,
      data: {
        leaguePlayer,
        originalPoints,
        newPoints,
        adjustment: pointsAdjustment,
        cumulativeManualAdjustment: newManualAdjustment
      },
      message: `Standings updated. Player ${leaguePlayer.player?.name || playerId} now has ${newPoints} points.`
    });
  } catch (error) {
    console.error("overrideStandings error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Player leave a league
 * POST /leagues/:leagueId/leave
 */
exports.leaveLeague = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;

    const league = await League.findByPk(leagueId);
    if (!league) {
      return res.status(404).json({ success: false, error: 'League not found' });
    }

    // Find the player record for this user
    const currentUser = await User.findByPk(userId);
    const allUsersWithEmail = await User.findAll({
      where: { email: currentUser.email },
      attributes: ['id']
    });
    const userIdsWithSameEmail = allUsersWithEmail.map(u => u.id);

    const player = await Player.findOne({
      where: { userId: { [Op.in]: userIdsWithSameEmail } }
    });

    if (!player) {
      return res.status(404).json({ success: false, error: 'Player profile not found' });
    }

    const enrollment = await LeaguePlayer.findOne({
      where: { leagueId, playerId: player.id }
    });

    if (!enrollment) {
      return res.status(400).json({ success: false, error: 'You are not enrolled in this league' });
    }

    if (league.status === 'active') {
      // If active, we should probably mark as withdrawn rather than deleting
      await enrollment.update({ status: 'withdrawn' });
      // Trigger standings recalculation
      const standingsService = require("../services/standingsService");
      await standingsService.updateLeagueStandings(leagueId);

      return res.json({
        success: true,
        message: 'You have withdrawn from the league. Your previous matches will remain in the records.',
        status: 'withdrawn'
      });
    } else {
      // If draft or registration_open, just remove the enrollment
      await enrollment.destroy();
      return res.json({
        success: true,
        message: 'Successfully left the league',
        status: 'removed'
      });
    }
  } catch (error) {
    console.error('leaveLeague error:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
};

module.exports = exports;