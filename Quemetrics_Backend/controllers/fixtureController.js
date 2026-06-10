const { Op } = require("sequelize");
const {
  League,
  Division,
  LeaguePlayer,
  Player,
  Fixture,
  Organization,
  MatchResult
} = require("../models");
const standingsService = require("../services/standingsService");
const { generateFixturesForLeague, advanceKnockoutWinner } = require('../services/fixtureGenerator');
const { processOverdueFixtures } = require('../services/fixtureService');
const { normalizeVenueToken, parseVenueCollections } = require("../utils/venueOwnerEmbedded");
const { ensureFixtureColumns } = require("../utils/ensureFixtureColumns");

// ============================================
// HELPERS
// ============================================

/**
 * Robustly determine sport from game name (handles typos and variations)
 */
const determineSportFromGameName = (gameName) => {
  if (!gameName) return 'snooker';
  const name = gameName.toLowerCase().trim();

  if (name.includes('snooker')) return 'snooker';

  if (name.includes('pool') ||
    name.includes('8-ball') ||
    name.includes('9-ball') ||
    name.includes('8 ball') ||
    name.includes('9 ball') ||
    name.includes('billiard') ||
    name.includes('8ball')) {
    return 'pool';
  }

  if (name.includes('pooker') || name.includes('pook')) {
    return 'pooker';
  }

  if (name.includes('poker') || name.includes('pooker')) {
    return 'pooker';
  }

  return 'snooker'; // Default fallback
};

// ============================================
// MAIN GENERATE FIXTURES ENDPOINT
// ============================================

/**
 * Generate fixtures for a league based on its wizard configuration.
 * POST /api/leagues/:leagueId/fixtures/generate
 */
exports.generateFixtures = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const { divisionId, mode = 'full', playerId } = req.body; // mode: 'full' or 'incremental'

    // Ensure fixture columns exist (e.g. date) before generation/selection
    await ensureFixtureColumns();

    // Verify organization owns the league
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id },
      include: [
        {
          association: "divisions",
          include: [
            {
              association: "players",
              include: [{ association: "player", attributes: ["id"] }]
            }
          ]
        },
        {
          association: "leaguePlayers",
          include: [{ association: "player", attributes: ["id"] }]
        }
      ]
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found or not owned by your organization" });
    }

    // Robust sport detection
    let sport = String(league.sport || '').toLowerCase();
    if (!sport || (sport !== 'snooker' && sport !== 'pool' && sport !== 'pooker')) {
      sport = determineSportFromGameName(league.gameName || league.basicInfo?.gameName);
      if (sport !== league.sport) {
        console.log(`[generateFixtures] Re-detected sport [${sport}] for league ${league.id}`);
        league.sport = sport;
        await league.save();
      }
    }

    // Poker leagues can now generate fixtures if they use a standard format (e.g. Round Robin)

    // Allow generation if it's a draft OR if it's active
    if (league.status !== "draft" && league.status !== "active") {
      return res.status(400).json({
        success: false,
        error: "Can only generate fixtures for draft or active leagues"
      });
    }

    // Check if fixtures already exist in the DB for this league
    const existingFixturesCount = await Fixture.count({ where: { leagueId } });

    // Only prevent full generation if fixtures exist; allow incremental mode always
    if (mode !== 'incremental' && league.fixturesGenerated && existingFixturesCount > 0) {
      return res.status(400).json({
        success: false,
        error: "Fixtures have already been generated for this league. Use incremental mode to add fixtures for new players."
      });
    }

    // Use the service to generate fixtures
    const options = { incremental: mode === 'incremental' };
    const fixtures = await generateFixturesForLeague(leagueId, divisionId, options);

    res.json({
      success: true,
      message: `${fixtures.length} fixtures generated successfully`,
      data: { count: fixtures.length }
    });
  } catch (error) {
    console.error("generateFixtures error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

// ============================================
// FIXTURE MANAGEMENT (EXISTING CODE PRESERVED)
// ============================================

/**
 * Helper function to load custom venue details - OPTIMIZED VERSION
 *
 * OLD VERSION: Queried ALL clubs for EACH booking (N+1 problem)
 * NEW VERSION: Collects all needed venue IDs, does ONE batch query
 */
async function enrichBookingsWithVenueDataBatch(fixtures) {
  if (!fixtures || fixtures.length === 0) return;

  const { Club } = require("../models");

  // Collect all unique custom venue IDs that need enrichment
  const customVenueIds = new Set();
  const bookingsNeedingEnrichment = [];

  for (const fixture of fixtures) {
    if (!fixture.bookings || fixture.bookings.length === 0) continue;

    for (const booking of fixture.bookings) {
      // Skip if venue data already exists
      if (booking.venue && booking.venue.venueName) {
        continue;
      }

      let venueRefToLookup = booking.venueId;
      if (booking.venueId && booking.venueId.includes(':')) {
        venueRefToLookup = booking.venueId.slice(booking.venueId.indexOf(':') + 1).trim();
      }

      // Only enrich custom venue IDs
      if (venueRefToLookup && (venueRefToLookup.startsWith('venue_') || venueRefToLookup.startsWith('virtual_'))) {
        customVenueIds.add(venueRefToLookup);
        bookingsNeedingEnrichment.push({ booking, lookupRef: venueRefToLookup });
      }
    }
  }

  if (customVenueIds.size === 0) return; // No custom venues to enrich

  // SINGLE BATCH QUERY instead of one query per club iteration
  try {
    const clubs = await Club.findAll({
      attributes: ['id', 'venues'],
      limit: 1000, // Reasonable limit to prevent huge queries
      raw: true
    });

    // Build a map of venueId → venue details
    const venueMap = new Map();

    for (const club of clubs) {
      if (!club.venues) continue;

      let clubVenues = [];
      try {
        if (typeof club.venues === 'string') {
          clubVenues = JSON.parse(club.venues);
        } else if (Array.isArray(club.venues)) {
          clubVenues = club.venues;
        } else if (typeof club.venues === 'object' && club.venues !== null) {
          clubVenues = Object.values(club.venues);
        }
      } catch (e) {
        continue;
      }

      // Map each venue by ID so we can lookup quickly
      for (const venue of clubVenues) {
        if (venue?.id && (venue.id.startsWith('venue_') || venue.id.startsWith('virtual_'))) {
          venueMap.set(venue.id, {
            id: venue.id,
            venueName: venue.name || venue.venueName,
            name: venue.name || venue.venueName
          });
        }
      }
    }

    // Apply enriched venue data to all bookings
    for (const { booking, lookupRef } of bookingsNeedingEnrichment) {
      const enrichedVenue = venueMap.get(lookupRef);
      if (enrichedVenue) {
        if (booking.venue) {
          booking.venue.venueName = enrichedVenue.venueName;
          booking.venue.name = enrichedVenue.name;
        } else {
          if (typeof booking.setDataValue === 'function') {
            booking.setDataValue('venue', enrichedVenue);
          } else {
            booking.venue = enrichedVenue;
          }
        }
      }
    }
  } catch (e) {
    console.error(`Error batch enriching venues:`, e.message);
    // Continue without venue enrichment rather than failing
  }
}

/**
 * Helper function to load custom venue details
 * For bookings with custom venueIds, look up venue from Club's venues array
 * DEPRECATED: Use enrichBookingsWithVenueDataBatch instead for better performance
 */
async function enrichBookingsWithVenueData(bookings) {
  if (!bookings || bookings.length === 0) return bookings;

  const { Club } = require("../models");

  for (const booking of bookings) {
    // If venue data already exists (from venueOwnerId association), skip
    if (booking.venue && booking.venue.venueName) {
      continue;
    }

    let venueRefToLookup = booking.venueId;
    if (booking.venueId && booking.venueId.includes(':')) {
      venueRefToLookup = booking.venueId.slice(booking.venueId.indexOf(':') + 1).trim();
    }

    // For custom venue IDs like 'venue_xxx' or 'virtual_xxx', look up in clubs
    if (venueRefToLookup && (venueRefToLookup.startsWith('venue_') || venueRefToLookup.startsWith('virtual_'))) {
      try {
        const clubs = await Club.findAll({
          attributes: ['id', 'venues'],
          raw: true
        });

        for (const club of clubs) {
          if (!club.venues) continue;

          let clubVenues = [];
          try {
            if (typeof club.venues === 'string') {
              clubVenues = JSON.parse(club.venues);
            } else if (Array.isArray(club.venues)) {
              clubVenues = club.venues;
            } else if (typeof club.venues === 'object' && club.venues !== null) {
              clubVenues = Object.values(club.venues);
            }
          } catch (e) {
            continue;
          }

          const foundVenue = clubVenues.find(v => v && v.id === venueRefToLookup);
          if (foundVenue) {
            const enrichedVenue = {
              id: foundVenue.id,
              venueName: foundVenue.name || foundVenue.venueName,
              name: foundVenue.name || foundVenue.venueName
            };

            if (booking.venue) {
              booking.venue.venueName = enrichedVenue.venueName;
              booking.venue.name = enrichedVenue.name;
            } else {
              if (typeof booking.setDataValue === 'function') {
                booking.setDataValue('venue', enrichedVenue);
              } else {
                booking.venue = enrichedVenue;
              }
            }
            break;
          }
        }
      } catch (e) {
        console.error(`Error enriching booking ${booking.id} with venue data:`, e.message);
      }
    }
  }

  return bookings;
}

/**
 * Get all fixtures for a league or division
 */
exports.getFixtures = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { divisionId, round, status } = req.query;

    // Ensure fixture columns exist (e.g. date) before selection
    await ensureFixtureColumns();

    // Trigger check for overdue fixtures and process forfeits (async so endpoint stays fast)
    processOverdueFixtures(leagueId).catch(e => console.warn(`[getFixtures] Auto-forfeit check failed for league ${leagueId}:`, e.message));

    // Fetch league to check format and determine visibility rules
    const league = await League.findByPk(leagueId, { attributes: ['id', 'format', 'structure', 'currentRound', 'status', 'sport'] });
    if (!league) return res.status(404).json({ success: false, error: "League not found" });

    // Self-Healing for Knockout Brackets (NON-BLOCKING):
    // Fire and forget - run in background without awaiting to avoid blocking the response
    // This was causing 300-500+ DB queries before returning data
    const healKnockoutBracket = async () => {
      try {
        const leagueFormat = String(league.format || '').toLowerCase();
        const leagueSport = String(league.sport || '').toLowerCase();
        if (league && (leagueFormat === 'knockout' || leagueFormat === 'groupsknockout')) {
          const { advanceKnockoutWinner } = require("../services/fixtureGenerator");
          const roundsToCheck = Array.from({ length: league.currentRound }, (_, i) => i + 1);

          try {
            const completedFixtures = await Fixture.findAll({
              where: { leagueId, round: roundsToCheck, status: 'completed' },
              attributes: ['id', 'winnerId', 'player1Id', 'player2Id', 'player1Frames', 'player2Frames', 'player1RackWins', 'player2RackWins']
            });
            for (const f of completedFixtures) {
              // Re-evaluate winner based on scores to catch data errors
              let actualWinnerId = f.winnerId;
              const s1 = leagueSport === 'pool' ? f.player1RackWins : f.player1Frames;
              const s2 = leagueSport === 'pool' ? f.player2RackWins : f.player2Frames;

              if (s1 > s2) actualWinnerId = f.player1Id;
              else if (s2 > s1) actualWinnerId = f.player2Id;

              if (actualWinnerId && actualWinnerId !== f.winnerId) {
                await f.update({ winnerId: actualWinnerId, loserId: (actualWinnerId === f.player1Id ? f.player2Id : f.player1Id) });
              }
              if (actualWinnerId) await advanceKnockoutWinner(f.id, actualWinnerId).catch(() => { });
            }

            // Also sync over straightforward Byes that might have been missed
            const byesToSync = await Fixture.findAll({
              where: { leagueId, round: roundsToCheck, status: 'bye', winnerId: { [Op.ne]: null } },
              attributes: ['id', 'winnerId']
            });
            for (const f of byesToSync) {
              await advanceKnockoutWinner(f.id, f.winnerId).catch(() => { });
            }
          } catch (err) {
            console.error("[getFixtures] KO repair error:", err.message);
          }
        }
      } catch (err) {
        console.error("[getFixtures] League fetch for KO repair error:", err.message);
      }
    };
    // Fire and forget - don't await this
    healKnockoutBracket();

    const where = { leagueId };
    if (divisionId) where.divisionId = divisionId;
    if (round) where.round = round;
    if (status) where.status = status;

    let structure = league?.structure || {};
    if (typeof structure === 'string') {
      try { structure = JSON.parse(structure); } catch (e) { structure = {}; }
    }

    const leagueFormat2 = String(league?.format || '').toLowerCase();
    const structureFormat2 = String(structure?.format || '').toLowerCase();
    const isKnockout = leagueFormat2 === 'knockout' || leagueFormat2 === 'groupsknockout' ||
      structureFormat2 === 'knockout' || structureFormat2 === 'groupsknockout';

    const fixtures = await Fixture.findAll({
      where,
      include: [
        {
          association: "player1",
          attributes: ["id", "name", "nickname"],
          include: [
            {
              model: LeaguePlayer,
              as: "leaguePlayers",
              where: { leagueId },
              required: false,
              attributes: ["status"]
            }
          ]
        },
        {
          association: "player2",
          attributes: ["id", "name", "nickname"],
          include: [
            {
              model: LeaguePlayer,
              as: "leaguePlayers",
              where: { leagueId },
              required: false,
              attributes: ["status"]
            }
          ]
        },
        { association: "winner", attributes: ["id", "name"] },
        { association: "division", attributes: ["id", "name"] },
        {
          association: "bookings",
          limit: 1,
          order: [['createdAt', 'DESC']],
          include: [
            { association: "venue", attributes: ["id", "name", "venueName", "venues"] }
          ]
        },
        {
          association: "matchResult",
          attributes: ["id", "imageUrl", "resultStatus", "notes", "isWalkover", "player1Frames", "player2Frames", "player1RackWins", "player2RackWins", "snookerFrameDetails", "poolRackDetails", "pookerFrameDetails"]
        }
      ],
      order: [
        ["round", "ASC"],
        ["matchNumber", "ASC"]
      ]
    });

    // --- KNOCKOUT VISIBILITY LOGIC ---
    // If knockout and not explicitly requested to show all, hide future rounds until current is done
    let finalFixtures = fixtures;
    if (isKnockout && req.query.showAll !== 'true') {
      // Group by round to check completion
      const roundsMap = {};
      fixtures.forEach(f => {
        if (!roundsMap[f.round]) roundsMap[f.round] = [];
        roundsMap[f.round].push(f);
      });

      const sortedRounds = Object.keys(roundsMap).map(Number).sort((a, b) => a - b);
      let maxVisibleRound = 1;

      for (const r of sortedRounds) {
        const roundMatches = roundsMap[r];
        // A round is complete if all matches are completed, byes, or cancelled
        const isRoundComplete = roundMatches.every(m => m.status === 'completed' || m.status === 'bye' || m.status === 'cancelled');

        if (isRoundComplete) {
          maxVisibleRound = r + 1;
        } else {
          // Current round is active, so we show it but hide anything AFTER it
          maxVisibleRound = r;
          break;
        }
      }

      finalFixtures = fixtures.filter(f => f.round <= maxVisibleRound);
      console.log(`[getFixtures] Knockout visibility: Round 1 to ${maxVisibleRound} shown for league ${leagueId}`);
    }

    // Batch enrich bookings with custom venue data (no more N+1 queries)
    await enrichBookingsWithVenueDataBatch(finalFixtures);

    // Resolve exact sub-venue names from VenueOwner embedded venues collection
    finalFixtures.forEach(fixture => {
      if (fixture.bookings && fixture.bookings.length > 0) {
        const booking = fixture.bookings[0];
        if (booking.venue && booking.venueId && booking.venue.venues) {
          const reqNorm = normalizeVenueToken(booking.venueId).toLowerCase();
          const clubVenues = parseVenueCollections(booking.venue.venues);
          const subVenue = clubVenues.find(cv => cv && cv.id && normalizeVenueToken(cv.id).toLowerCase() === reqNorm);
          if (subVenue && subVenue.name) {
            booking.venue.venueName = subVenue.name;
            booking.venue.name = subVenue.name;
          }
        }
      }
    });

    res.json({ success: true, data: finalFixtures, message: "Fixtures retrieved" });
  } catch (error) {
    console.error("getFixtures error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get single fixture by ID
 */
exports.getFixtureById = async (req, res) => {
  try {
    const { fixtureId } = req.params;

    // Ensure fixture columns exist (e.g. date) before selection
    await ensureFixtureColumns();

    const fixture = await Fixture.findByPk(fixtureId, {
      include: [
        { association: "player1", attributes: ["id", "name", "nickname"] },
        { association: "player2", attributes: ["id", "name", "nickname"] },
        { association: "winner", attributes: ["id", "name"] },
        { association: "loser", attributes: ["id", "name"] },
        { association: "division", attributes: ["id", "name"] },
        { association: "league" },
        {
          association: "bookings",
          limit: 1,
          order: [['createdAt', 'DESC']],
          include: [
            { association: "venue", attributes: ["id", "name", "venueName", "venues"] }
          ]
        },
        {
          association: "matchResult",
          attributes: ["id", "imageUrl", "resultStatus", "notes", "isWalkover", "player1Frames", "player2Frames", "player1RackWins", "player2RackWins", "snookerFrameDetails", "poolRackDetails", "pookerFrameDetails"]
        }
      ]
    });

    if (!fixture) {
      return res.status(404).json({ success: false, error: "Fixture not found" });
    }

    // Enrich bookings with custom venue data
    if (fixture.bookings) {
      fixture.bookings = await enrichBookingsWithVenueData(fixture.bookings);

      // Resolve exact sub-venue names
      if (fixture.bookings.length > 0) {
        const booking = fixture.bookings[0];
        if (booking.venue && booking.venueId && booking.venue.venues) {
          const reqNorm = normalizeVenueToken(booking.venueId).toLowerCase();
          const clubVenues = parseVenueCollections(booking.venue.venues);
          const subVenue = clubVenues.find(cv => cv && cv.id && normalizeVenueToken(cv.id).toLowerCase() === reqNorm);
          if (subVenue && subVenue.name) {
            booking.venue.venueName = subVenue.name;
            booking.venue.name = subVenue.name;
          }
        }
      }
    }

    res.json({ success: true, data: fixture, message: "Fixture retrieved" });
  } catch (error) {
    console.error("getFixtureById error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Record match result
 */
exports.recordMatchResult = async (req, res) => {
  try {
    const { userId } = req.user;
    const { fixtureId } = req.params;
    const {
      player1Frames,
      player2Frames,
      player1RackWins,
      player2RackWins,
      player1Handicap = 0,
      player2Handicap = 0,
      resultData,
      snookerFrameDetails,
      poolRackDetails,
      pookerFrameDetails,
      frameDetails
    } = req.body;

    let actualFrameDetails = snookerFrameDetails || poolRackDetails || pookerFrameDetails || frameDetails || [];
    if (typeof actualFrameDetails === 'string') {
      try {
        actualFrameDetails = JSON.parse(actualFrameDetails);
      } catch (e) {
        actualFrameDetails = [];
      }
    }

    // Ensure fixture columns exist (e.g. date) before selection
    await ensureFixtureColumns();

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const fixture = await Fixture.findByPk(fixtureId, {
      include: [{ association: "league" }]
    });

    if (!fixture) {
      return res.status(404).json({ success: false, error: "Fixture not found" });
    }

    const league = fixture.league;
    if (!league || league.organizationId !== organization.id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to update this fixture"
      });
    }

    // Parse Advanced Settings for result editing permissions
    let advancedSettings = league.advanced || {};
    if (typeof advancedSettings === 'string') {
      try { advancedSettings = JSON.parse(advancedSettings); } catch (e) { advancedSettings = {}; }
    }

    if (fixture.status === "completed") {
      if (!advancedSettings.adminEditResults) {
        return res.status(400).json({
          success: false,
          error: "Match already completed. Enable 'adminEditResults' in advanced settings to modify."
        });
      }
      console.log(`[recordMatchResult] Admin correcting result for completed fixture ${fixtureId}`);
    }

    // Parse Match Rules
    let matchRules = league.matchRules || {};
    if (typeof matchRules === 'string') {
      try { matchRules = JSON.parse(matchRules); } catch (e) { matchRules = {}; }
    }

    let isKnockoutFormat = false;
    try {
      if (league.structure) {
        const structure = typeof league.structure === 'string' ? JSON.parse(league.structure) : league.structure;
        if (structure.format === 'knockout' || structure.format === 'groupKnockout') {
          isKnockoutFormat = true;
        }
      }
    } catch (e) { }

    const bestOf = parseInt(matchRules.bestOf) || 3;
    const firstTo = Math.ceil(bestOf / 2);
    const handicapEnabled = matchRules.handicap?.enabled || false;
    const handicapMode = matchRules.handicap?.type || 'manual';

    // Determine winner based on sport and rules
    let winnerId, loserId;
    let finalPlayer1Score = 0;
    let finalPlayer2Score = 0;

    const leagueSport2 = String(league.sport || '').toLowerCase();
    if (leagueSport2 === "snooker") {
      if (player1Frames === undefined || player2Frames === undefined) {
        return res.status(400).json({
          success: false,
          error: "Frame scores required for Snooker"
        });
      }
      if (player1Frames < firstTo && player2Frames < firstTo) {
        if (player1Frames !== player2Frames || player1Frames + player2Frames !== bestOf) {
          // Warning: Score might be incomplete, but we'll record it.
        }
      }
      let adjP1Score = player1Frames;
      let adjP2Score = player2Frames;
      let handicapInfo = null;
      if (handicapEnabled) {
        const LeaguePlayerModel = require('../models/LeaguePlayer');
        let p1Handicap = player1Handicap;
        let p2Handicap = player2Handicap;
        if (handicapMode === 'manual') {
          // Use provided handicaps
        } else if (handicapMode === 'auto') {
          // Auto: Calculate from ratings
          const p1 = await LeaguePlayerModel.findOne({ where: { leagueId: league.id, playerId: fixture.player1Id } });
          const p2 = await LeaguePlayerModel.findOne({ where: { leagueId: league.id, playerId: fixture.player2Id } });
          const r1 = p1?.rating || 0;
          const r2 = p2?.rating || 0;
          // Example: 1 handicap per 10 rating points difference
          p1Handicap = Math.round((r2 - r1) / 10);
          p2Handicap = Math.round((r1 - r2) / 10);
        } else if (handicapMode === 'dynamic') {
          // Dynamic: Use current LeaguePlayer.handicap (updated weekly elsewhere)
          const p1 = await LeaguePlayerModel.findOne({ where: { leagueId: league.id, playerId: fixture.player1Id } });
          const p2 = await LeaguePlayerModel.findOne({ where: { leagueId: league.id, playerId: fixture.player2Id } });
          p1Handicap = p1?.handicap || 0;
          p2Handicap = p2?.handicap || 0;
        } else if (handicapMode === 'fixed') {
          // Fixed: Use LeaguePlayer.handicap set at league start
          const p1 = await LeaguePlayerModel.findOne({ where: { leagueId: league.id, playerId: fixture.player1Id } });
          const p2 = await LeaguePlayerModel.findOne({ where: { leagueId: league.id, playerId: fixture.player2Id } });
          p1Handicap = p1?.handicap || 0;
          p2Handicap = p2?.handicap || 0;
        }
        adjP1Score += p1Handicap;
        adjP2Score += p2Handicap;
        handicapInfo = { player1: p1Handicap, player2: p2Handicap, mode: handicapMode };
      }
      const tieBreakWinnerId = req.body.tieBreakWinnerId;
      const tieBreakMethod = req.body.tieBreakMethod;
      // Tied score
      if (adjP1Score > adjP2Score) {
        winnerId = fixture.player1Id;
        loserId = fixture.player2Id;
      } else if (adjP1Score < adjP2Score) {
        winnerId = fixture.player2Id;
        loserId = fixture.player1Id;
      } else {
        // Tied score
        if (tieBreakWinnerId) {
          winnerId = tieBreakWinnerId;
          loserId = tieBreakWinnerId === fixture.player1Id ? fixture.player2Id : fixture.player1Id;
        } else if (!matchRules.allowDraw || isKnockoutFormat) {
          if (isKnockoutFormat) {
            return res.status(400).json({
              success: false,
              error: "Knockout matches cannot end in a tie. A tie-break winner is required."
            });
          }
          return res.status(400).json({
            success: false,
            error: "Match ended in a tie. A tie-break winner and method are required."
          });
        }
      }

      finalPlayer1Score = player1Frames;
      finalPlayer2Score = player2Frames;
      await fixture.update({
        player1Frames,
        player2Frames,
        winnerId,
        loserId,
        status: "completed",
        resultData: {
          ...resultData,
          handicaps: handicapInfo,
          adjustedScore: handicapEnabled ? { player1: adjP1Score, player2: adjP2Score } : null,
          bestOf,
          tieBreakWinnerId,
          tieBreakMethod,
          snookerFrameDetails: actualFrameDetails,
          frameDetails: actualFrameDetails
        }
      });
    } else if (leagueSport2 === "pool") {
      if (player1RackWins === undefined || player2RackWins === undefined) {
        return res.status(400).json({
          success: false,
          error: "Rack wins required for Pool"
        });
      }
      let adjP1Score = player1RackWins;
      let adjP2Score = player2RackWins;
      let handicapInfo = null;
      if (handicapEnabled) {
        const LeaguePlayerModel = require('../models/LeaguePlayer');
        let p1Handicap = player1Handicap;
        let p2Handicap = player2Handicap;
        if (handicapMode === 'manual') {
          // Use provided handicaps
        } else if (handicapMode === 'auto') {
          const p1 = await LeaguePlayerModel.findOne({ where: { leagueId: league.id, playerId: fixture.player1Id } });
          const p2 = await LeaguePlayerModel.findOne({ where: { leagueId: league.id, playerId: fixture.player2Id } });
          const r1 = p1?.rating || 0;
          const r2 = p2?.rating || 0;
          p1Handicap = Math.round((r2 - r1) / 10);
          p2Handicap = Math.round((r1 - r2) / 10);
        } else if (handicapMode === 'dynamic') {
          const p1 = await LeaguePlayerModel.findOne({ where: { leagueId: league.id, playerId: fixture.player1Id } });
          const p2 = await LeaguePlayerModel.findOne({ where: { leagueId: league.id, playerId: fixture.player2Id } });
          p1Handicap = p1?.handicap || 0;
          p2Handicap = p2?.handicap || 0;
        } else if (handicapMode === 'fixed') {
          const p1 = await LeaguePlayerModel.findOne({ where: { leagueId: league.id, playerId: fixture.player1Id } });
          const p2 = await LeaguePlayerModel.findOne({ where: { leagueId: league.id, playerId: fixture.player2Id } });
          p1Handicap = p1?.handicap || 0;
          p2Handicap = p2?.handicap || 0;
        }
        adjP1Score += p1Handicap;
        adjP2Score += p2Handicap;
        handicapInfo = { player1: p1Handicap, player2: p2Handicap, mode: handicapMode };
      }
      const tieBreakWinnerId = req.body.tieBreakWinnerId;
      const tieBreakMethod = req.body.tieBreakMethod;

      if (adjP1Score > adjP2Score) {
        winnerId = fixture.player1Id;
        loserId = fixture.player2Id;
      } else if (adjP1Score < adjP2Score) {
        winnerId = fixture.player2Id;
        loserId = fixture.player1Id;
      } else {
        // Tied score
        if (tieBreakWinnerId) {
          winnerId = tieBreakWinnerId;
          loserId = tieBreakWinnerId === fixture.player1Id ? fixture.player2Id : fixture.player1Id;
        } else {
          // A draw is blocked ONLY if allowDraw is explicitly false OR a noDrawRule is configured OR it's a knockout format
          const poolAdminShouldBlockDraw = matchRules.allowDraw === false ||
            (matchRules.noDrawRule && matchRules.noDrawRule !== 'none') || isKnockoutFormat;
          if (poolAdminShouldBlockDraw) {
            if (isKnockoutFormat) {
              return res.status(400).json({
                success: false,
                error: "Knockout matches cannot end in a tie. A tie-break winner is required."
              });
            }
            return res.status(400).json({
              success: false,
              error: "Match ended in a tie. A tie-break winner and method are required."
            });
          }
          // Draw is allowed: winnerId/loserId remain null
        }
      }

      finalPlayer1Score = player1RackWins;
      finalPlayer2Score = player2RackWins;
      await fixture.update({
        player1RackWins,
        player2RackWins,
        winnerId,
        loserId,
        status: "completed",
        resultData: {
          ...resultData,
          handicaps: handicapInfo,
          adjustedScore: handicapEnabled ? { player1: adjP1Score, player2: adjP2Score } : null,
          bestOf,
          tieBreakWinnerId,
          tieBreakMethod,
          poolRackDetails: actualFrameDetails,
          frameDetails: actualFrameDetails
        }
      });
    } else if (leagueSport2 === "pooker") {
      // Pooker: uses frames like snooker
      if (player1Frames === undefined || player2Frames === undefined) {
        return res.status(400).json({
          success: false,
          error: "Frame scores required for Pooker"
        });
      }
      let adjP1Score = player1Frames;
      let adjP2Score = player2Frames;
      if (handicapEnabled) {
        adjP1Score += player1Handicap;
        adjP2Score += player2Handicap;
      }
      const tieBreakWinnerId = req.body.tieBreakWinnerId;
      const tieBreakMethod = req.body.tieBreakMethod;

      if (adjP1Score > adjP2Score) {
        winnerId = fixture.player1Id;
        loserId = fixture.player2Id;
      } else if (adjP1Score < adjP2Score) {
        winnerId = fixture.player2Id;
        loserId = fixture.player1Id;
      } else {
        // Tied score
        if (tieBreakWinnerId) {
          winnerId = tieBreakWinnerId;
          loserId = tieBreakWinnerId === fixture.player1Id ? fixture.player2Id : fixture.player1Id;
        } else {
          // A draw is blocked ONLY if allowDraw is explicitly false OR a noDrawRule is configured OR it's a knockout format
          const pookerAdminShouldBlockDraw = matchRules.allowDraw === false ||
            (matchRules.noDrawRule && matchRules.noDrawRule !== 'none') || isKnockoutFormat;
          if (pookerAdminShouldBlockDraw) {
            if (isKnockoutFormat) {
              return res.status(400).json({
                success: false,
                error: "Knockout matches cannot end in a tie. A tie-break winner is required."
              });
            }
            return res.status(400).json({
              success: false,
              error: "Match ended in a tie. A tie-break winner and method are required."
            });
          }
          // Draw is allowed: winnerId/loserId remain null
        }
      }

      finalPlayer1Score = player1Frames;
      finalPlayer2Score = player2Frames;
      await fixture.update({
        player1Frames,
        player2Frames,
        winnerId,
        loserId,
        status: "completed",
        resultData: {
          ...resultData,
          bestOf,
          tieBreakWinnerId,
          tieBreakMethod,
          pookerFrameDetails: actualFrameDetails,
          frameDetails: actualFrameDetails
        }
      });
    }

    // Upsert MatchResult record so it is picked up by standingsService
    let matchResult = await MatchResult.findOne({ where: { fixtureId: fixture.id } });

    // Default to player1Id for submittedBy to satisfy required foreign key, admin is the actual approver
    const matchResultData = {
      fixtureId: fixture.id,
      leagueId: fixture.leagueId,
      matchType: "league",
      sport: league.sport,
      submittedBy: fixture.player1Id,
      player1Id: fixture.player1Id,
      player2Id: fixture.player2Id,
      winnerId: winnerId || null,
      resultStatus: "Confirmed",
      adminApprovedBy: userId,
      adminApprovedAt: new Date(),
      tieBreakWinnerId: req.body.tieBreakWinnerId || null,
      tieBreakMethod: req.body.tieBreakMethod || null,
      resultData: {
        handicaps: handicapEnabled ? { player1: req.body.player1Handicap, player2: req.body.player2Handicap } : null,
        adjustedScore: handicapEnabled ? { player1: finalPlayer1Score + (req.body.player1Handicap || 0), player2: finalPlayer2Score + (req.body.player2Handicap || 0) } : null,
        bestOf,
        tieBreakWinnerId: req.body.tieBreakWinnerId,
        tieBreakMethod: req.body.tieBreakMethod
      }
    };

    const normalizedLeagueSport = String(league.sport || '').toLowerCase();
    if (normalizedLeagueSport === "snooker") {
      matchResultData.player1Frames = finalPlayer1Score;
      matchResultData.player2Frames = finalPlayer2Score;
      matchResultData.snookerFrameDetails = actualFrameDetails;
    } else if (normalizedLeagueSport === "pool") {
      matchResultData.player1RackWins = finalPlayer1Score;
      matchResultData.player2RackWins = finalPlayer2Score;
      matchResultData.poolRackDetails = actualFrameDetails;
    } else if (normalizedLeagueSport === "pooker") {
      matchResultData.player1Frames = finalPlayer1Score;
      matchResultData.player2Frames = finalPlayer2Score;
      matchResultData.pookerFrameDetails = actualFrameDetails;
    }

    if (matchResult) {
      await matchResult.update(matchResultData);
    } else {
      await MatchResult.create(matchResultData);
    }

    // Trigger full standings recalculation (applies pointsSystem, bonuses, tieBreaks)
    await standingsService.updateLeagueStandings(fixture.leagueId);

    // Check if this is a Swiss league and update pairings for next round if needed
    if (fixture.stage === 'swiss') {
      const { checkAndUpdateSwissPairings } = require('../services/fixtureGenerator');
      try {
        await checkAndUpdateSwissPairings(fixture.leagueId, fixture.round, fixture.divisionId);
      } catch (swissError) {
        console.error('[recordMatchResult] Error updating Swiss pairings:', swissError.message);
        // Don't fail the match recording if Swiss pairing fails
      }
    }

    // Check if this is a Knockout/GroupsKnockout and advance the winner
    if (fixture.stage === 'knockout' || fixture.stage === 'groupsKnockout') {
      try {
        const { advanceKnockoutWinner } = require('../services/fixtureGenerator');
        await advanceKnockoutWinner(fixture.id, winnerId);
      } catch (koError) {
        console.error('[recordMatchResult] Error advancing knockout winner:', koError.message);
      }
    }

    // Check if league is now fully completed
    const { checkLeagueCompletion } = require('../services/fixtureGenerator');
    await checkLeagueCompletion(fixture.leagueId);

    const updatedFixture = await Fixture.findByPk(fixtureId, {
      include: [
        { association: "player1", attributes: ["id", "name"] },
        { association: "player2", attributes: ["id", "name"] },
        { association: "winner", attributes: ["id", "name"] }
      ]
    });

    res.json({
      success: true,
      data: updatedFixture,
      message: "Match result recorded successfully"
    });
  } catch (error) {
    console.error("recordMatchResult error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Record a Manual Walkover (No-Show)
 */
exports.recordWalkover = async (req, res) => {
  try {
    const { userId } = req.user;
    const { fixtureId } = req.params;
    const { winnerPlayerId } = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const fixture = await Fixture.findByPk(fixtureId, {
      include: [{ association: "league" }]
    });

    if (!fixture) {
      return res.status(404).json({ success: false, error: "Fixture not found" });
    }

    const league = fixture.league;
    if (!league || league.organizationId !== organization.id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to update this fixture"
      });
    }

    if (fixture.status === "completed") {
      return res.status(400).json({
        success: false,
        error: "Match already completed."
      });
    }

    if (!winnerPlayerId || (winnerPlayerId !== fixture.player1Id && winnerPlayerId !== fixture.player2Id)) {
      return res.status(400).json({
        success: false,
        error: "Valid winnerPlayerId is required."
      });
    }

    // Parse Match Rules for walkover settings
    let matchRules = league.matchRules || {};
    if (typeof matchRules === 'string') {
      try { matchRules = JSON.parse(matchRules); } catch (e) { matchRules = {}; }
    }

    let walkoverMode = matchRules.walkover?.mode || matchRules.walkover?.rule || 'auto';
    // Map rule values to mode values for backward compatibility
    if (walkoverMode === 'auto3-0') {
      walkoverMode = 'auto';
    }

    const { customScore } = req.body;
    const parseCustomScore = (score) => {
      if (!score || typeof score !== 'string') return null;
      if (!/^[0-9]+[–-][0-9]+$/.test(score)) return null;
      const parts = score.split(/[–-]/);
      return {
        win: parseInt(parts[0], 10) || 0,
        loss: parseInt(parts[1], 10) || 0,
      };
    };

    const customParsed = parseCustomScore(customScore);
    if (customScore && !customParsed) {
      return res.status(400).json({ success: false, error: "Custom score must be in format 'X–Y' (e.g., 3-0)." });
    }

    let score1 = 0, score2 = 0;

    if (customParsed) {
      // Use the provided custom score, regardless of configured walkover mode.
      const { win, loss } = customParsed;
      if (String(winnerPlayerId) === String(fixture.player1Id)) {
        score1 = win; score2 = loss;
      } else {
        score1 = loss; score2 = win;
      }
    } else {
      // Default auto walkover score based on bestOf
      const defaultWinScore = Math.ceil((parseInt(matchRules.bestOf) || 5) / 2);
      if (String(winnerPlayerId) === String(fixture.player1Id)) score1 = defaultWinScore;
      else score2 = defaultWinScore;
    }

    // Ensure resultData is an object
    let currentResultData = fixture.resultData;
    if (typeof currentResultData === 'string') {
      try { currentResultData = JSON.parse(currentResultData); } catch (e) { currentResultData = {}; }
    }
    if (!currentResultData || typeof currentResultData !== 'object') currentResultData = {};

    const isP1Winner = String(winnerPlayerId) === String(fixture.player1Id);
    const loserPlayerId = isP1Winner ? fixture.player2Id : fixture.player1Id;

    const updateData = {
      winnerId: winnerPlayerId,
      loserId: loserPlayerId,
      status: "completed",
      detailedStatus: "WALKOVER",
      resultData: {
        ...currentResultData,
        isManualWalkover: true,
        walkoverScore: `${score1}-${score2}`,
        note: 'Manual Walkover enforced by Admin.'
      }
    };

    // Detect sport from multiple sources
    const rawSport = league.sport || fixture.sport || (league.basicInfo && league.basicInfo.sport) || "";
    const normalizedSport = String(rawSport).toLowerCase().trim();

    console.log(`[recordWalkover] Detected sport: "${rawSport}" (normalized: "${normalizedSport}")`);

    if (normalizedSport === 'snooker' || normalizedSport === 'pooker' || normalizedSport === 'billiards') {
      updateData.player1Frames = score1;
      updateData.player2Frames = score2;
    } else if (normalizedSport === 'pool') {
      updateData.player1RackWins = score1;
      updateData.player2RackWins = score2;
    } else {
      // Fallback: If sport is unknown, set both sets of columns to be safe
      updateData.player1Frames = score1;
      updateData.player2Frames = score2;
      updateData.player1RackWins = score1;
      updateData.player2RackWins = score2;
    }

    console.log(`[recordWalkover] Updating fixture ${fixtureId} with:`, JSON.stringify(updateData));
    await fixture.update(updateData);

    // Upsert MatchResult record so it is picked up by standingsService
    let matchResult = await MatchResult.findOne({ where: { fixtureId: fixture.id } });

    const matchResultData = {
      fixtureId: fixture.id,
      leagueId: fixture.leagueId,
      matchType: "league",
      sport: rawSport,
      submittedBy: fixture.player1Id,
      player1Id: fixture.player1Id,
      player2Id: fixture.player2Id,
      winnerId: winnerPlayerId,
      isWalkover: true,
      resultStatus: "Confirmed",
      adminApprovedBy: userId,
      adminApprovedAt: new Date(),
      resultData: updateData.resultData
    };

    if (normalizedSport === 'snooker' || normalizedSport === 'pooker' || normalizedSport === 'billiards') {
      matchResultData.player1Frames = score1;
      matchResultData.player2Frames = score2;
    } else if (normalizedSport === 'pool') {
      matchResultData.player1RackWins = score1;
      matchResultData.player2RackWins = score2;
    } else {
      matchResultData.player1Frames = score1;
      matchResultData.player2Frames = score2;
    }

    if (matchResult) {
      await matchResult.update(matchResultData);
    } else {
      await MatchResult.create(matchResultData);
    }

    // Trigger full standings recalculation (applies pointsSystem, bonuses, tieBreaks)
    await standingsService.updateLeagueStandings(fixture.leagueId);

    // Check if this is a Swiss league and update pairings for next round if needed
    if (fixture.stage === 'swiss') {
      const { checkAndUpdateSwissPairings } = require('../services/fixtureGenerator');
      try {
        await checkAndUpdateSwissPairings(fixture.leagueId, fixture.round, fixture.divisionId);
      } catch (swissError) {
        console.error('[recordWalkover] Error updating Swiss pairings:', swissError.message);
        // Don't fail the walkover recording if Swiss pairing fails
      }
    }

    // Check if this is a Knockout/GroupsKnockout and advance the winner
    if (fixture.stage === 'knockout' || fixture.stage === 'groupsKnockout') {
      try {
        const { advanceKnockoutWinner } = require('../services/fixtureGenerator');
        await advanceKnockoutWinner(fixture.id, winnerPlayerId);
      } catch (koError) {
        console.error('[recordWalkover] Error advancing knockout winner:', koError.message);
      }
    }

    // Check if league is now fully completed
    const { checkLeagueCompletion } = require('../services/fixtureGenerator');
    await checkLeagueCompletion(fixture.leagueId);

    const updatedFixture = await Fixture.findByPk(fixtureId, {
      include: [
        { association: "player1", attributes: ["id", "name"] },
        { association: "player2", attributes: ["id", "name"] },
        { association: "winner", attributes: ["id", "name"] },
        { association: "loser", attributes: ["id", "name"] }
      ]
    });

    res.json({
      success: true,
      data: updatedFixture,
      message: "Walkover recorded successfully"
    });
  } catch (error) {
    console.error("recordWalkover error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Update fixture (reschedule, change status, etc.)
 */
exports.updateFixture = async (req, res) => {
  try {
    const { userId } = req.user;
    const { fixtureId } = req.params;
    const updateData = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const fixture = await Fixture.findByPk(fixtureId, {
      include: [{ association: "league" }]
    });

    if (!fixture) {
      return res.status(404).json({ success: false, error: "Fixture not found" });
    }

    const league = await League.findOne({
      where: { id: fixture.leagueId, organizationId: organization.id }
    });

    if (!league) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to update this fixture"
      });
    }

    // enforce admin rules from league advanced settings
    let adv = league.advanced || {};
    if (typeof adv === 'string') {
      try { adv = JSON.parse(adv); } catch (e) { adv = {}; }
    }

    // check fixture editing (schedule changes)
    const fixtureFields = [
      'scheduledDate',
      'startTime',
      'endTime',
      'player1Id',
      'player2Id',
      'round',
      'matchNumber'
    ];
    if (!adv.adminEditFixtures) {
      const hasFixtureChange = Object.keys(updateData).some(k => fixtureFields.includes(k));
      if (hasFixtureChange) {
        return res.status(403).json({
          success: false,
          error: "League rules prevent admin from editing fixtures. Enable adminEditFixtures in advanced settings to allow this."
        });
      }
    }
    // check result editing
    const resultFields = [
      'winnerId',
      'player1Frames',
      'player2Frames',
      'player1RackWins',
      'player2RackWins',
      'resultData'
    ];
    if (!adv.adminEditResults) {
      const hasResultChange = Object.keys(updateData).some(k => resultFields.includes(k));
      if (hasResultChange) {
        return res.status(403).json({
          success: false,
          error: "League rules prevent admin from editing results. Enable adminEditResults in advanced settings to allow this."
        });
      }
    }

    await fixture.update(updateData);

    // If scheduled by organizer, automatically create/update a confirmed Booking record
    let resDataObj = fixture.resultData;
    if (typeof resDataObj === 'string') {
      try { resDataObj = JSON.parse(resDataObj); } catch (e) { resDataObj = null; }
    }

    if (resDataObj && resDataObj.isOrganizerScheduled === true) {
      try {
        const { Booking } = require("../models");
        const bookingDateStr = new Date(fixture.scheduledDate).toISOString().split('T')[0];

        const isUUID = (str) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
        const venueOwnerId = isUUID(resDataObj.venueId) ? resDataObj.venueId : null;
        const venueIdVal = venueOwnerId ? null : resDataObj.venueId;

        const bookingData = {
          fixtureId: fixture.id,
          leagueId: fixture.leagueId,
          bookingType: "league",
          playerId: fixture.player1Id,
          opponentId: fixture.player2Id,
          venueOwnerId: venueOwnerId,
          venueId: venueIdVal,
          bookingDate: bookingDateStr,
          startTime: updateData.startTime || "00:00:00",
          endTime: updateData.endTime || "00:00:00",
          tableNumber: Number(resDataObj.tableNumber) || 1,
          tableName: resDataObj.venueTableName || resDataObj.tableName || "Table 1",
          status: "confirmed",
          confirmedAt: new Date(),
          confirmedBy: fixture.player2Id,
          sport: league.sport || "snooker"
        };

        let booking = await Booking.findOne({ where: { fixtureId: fixture.id } });
        if (booking) {
          await booking.update(bookingData);
        } else {
          await Booking.create(bookingData);
        }
        console.log(`[updateFixture] Automatically created/updated confirmed Booking for fixture ${fixture.id}`);

        // Fetch player profiles to send email notifications
        try {
          const { Player } = require("../models");
          const player1 = await Player.findByPk(fixture.player1Id, {
            include: [{ association: "user", attributes: ["email"] }]
          });
          const player2 = await Player.findByPk(fixture.player2Id, {
            include: [{ association: "user", attributes: ["email"] }]
          });

          const player1Email = player1?.user?.email;
          const player2Email = player2?.user?.email;
          const player1Name = player1?.nickname || player1?.name || "Player 1";
          const player2Name = player2?.nickname || player2?.name || "Player 2";

          const { sendOrganizerScheduledEmail } = require("../utils/email");

          if (player1Email) {
            await sendOrganizerScheduledEmail({
              playerEmail: player1Email,
              playerName: player1Name,
              opponentName: player2Name,
              leagueName: league.name,
              round: fixture.round,
              scheduledDate: fixture.scheduledDate,
              startTime: updateData.startTime || "00:00:00",
              venueName: resDataObj.venueName || "Venue",
              tableName: resDataObj.venueTableName || "Table"
            });
          }

          if (player2Email) {
            await sendOrganizerScheduledEmail({
              playerEmail: player2Email,
              playerName: player2Name,
              opponentName: player1Name,
              leagueName: league.name,
              round: fixture.round,
              scheduledDate: fixture.scheduledDate,
              startTime: updateData.startTime || "00:00:00",
              venueName: resDataObj.venueName || "Venue",
              tableName: resDataObj.venueTableName || "Table"
            });
          }
        } catch (mailErr) {
          console.error("[updateFixture] Error sending schedule emails:", mailErr.message || mailErr);
        }
      } catch (bookingErr) {
        console.error("[updateFixture] Error creating automatic Booking:", bookingErr.message || bookingErr);
      }
    }

    res.json({ success: true, data: fixture, message: "Fixture updated" });
  } catch (error) {
    console.error("updateFixture error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Delete fixture
 */
exports.deleteFixture = async (req, res) => {
  try {
    const { userId } = req.user;
    const { fixtureId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const fixture = await Fixture.findByPk(fixtureId);
    if (!fixture) {
      return res.status(404).json({ success: false, error: "Fixture not found" });
    }

    const league = await League.findOne({
      where: { id: fixture.leagueId, organizationId: organization.id }
    });

    if (!league) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to delete this fixture"
      });
    }

    if (fixture.status === "completed") {
      return res.status(400).json({
        success: false,
        error: "Cannot delete completed fixtures"
      });
    }

    await fixture.destroy();

    res.json({ success: true, data: null, message: "Fixture deleted" });
  } catch (error) {
    console.error("deleteFixture error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};