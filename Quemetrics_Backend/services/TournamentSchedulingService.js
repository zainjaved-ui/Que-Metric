const { Op } = require("sequelize");
const { Tournament, TournamentMatch, Booking } = require("../models");

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "yes") return true;
    if (v === "false" || v === "no" || v === "") return false;
  }
  return Boolean(value);
}

/**
 * Parse date safely
 */
function parseDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeSchedulingConfig(input = {}, fallback = {}) {
  return {
    autoGenerateFixtures: toBoolean(
      input.autoGenerateFixtures,
      toBoolean(fallback.autoGenerateFixtures, true)
    ),
    flexibleScheduling: toBoolean(
      input.flexibleScheduling,
      toBoolean(fallback.flexibleScheduling, false)
    ),
    enforceDeadlines: toBoolean(
      input.enforceDeadlines ?? input.matchDeadlineEnforcement,
      toBoolean(fallback.enforceDeadlines ?? fallback.matchDeadlineEnforcement, true)
    ),
    autoForfeit: toBoolean(
      input.autoForfeit ?? input.autoForfeitOverdue,
      toBoolean(fallback.autoForfeit ?? fallback.autoForfeitOverdue, false)
    ),
  };
}

function getSchedulingConfigFromTournament(tournament) {
  const row = tournament?.dataValues || tournament || {};
  const nested = row.schedulingConfig && typeof row.schedulingConfig === "object" ? row.schedulingConfig : {};
  return normalizeSchedulingConfig(nested, row);
}

async function applyAutoForfeitForTournament(tournamentOrId) {
  let tournament;
  if (typeof tournamentOrId === 'object' && tournamentOrId !== null) {
    tournament = tournamentOrId;
  } else {
    tournament = await Tournament.findByPk(tournamentOrId);
  }

  if (!tournament) return { updated: 0 };

  const config = getSchedulingConfigFromTournament(tournament);
  if (!config.autoForfeit || !config.enforceDeadlines) return { updated: 0 };

  const now = new Date();
  const overdueMatches = await TournamentMatch.findAll({
    where: {
      tournamentId: tournament.id,
      status: { [Op.in]: ["scheduled", "in_progress"] },
      scheduledDeadline: { [Op.ne]: null, [Op.lt]: now },
    },
  });

  if (overdueMatches.length === 0) return { updated: 0 };

  // Use bulk update if possible, but match.update might have hooks or side effects
  // For now, keep the loop but use Promise.all to run in parallel
  const updates = overdueMatches.map(match => 
    match.update({
      status: "completed",
      winner: null,
      isDefault: true,
    })
  );
  
  await Promise.all(updates);

  return { updated: overdueMatches.length };
}

async function processAutoForfeitForAllTournaments() {
  // Only fetch tournaments that could potentially have auto-forfeit enabled
  const tournaments = await Tournament.findAll({
    attributes: ["id", "autoForfeitOverdue", "matchDeadlineEnforcement", "schedulingConfig"],
  });

  let totalUpdated = 0;
  // Run all tournament checks in parallel
  const tasks = tournaments.map(t => applyAutoForfeitForTournament(t));
  const results = await Promise.all(tasks);
  
  results.forEach(r => {
    totalUpdated += r.updated;
  });
  
  return { updated: totalUpdated };
}

/**
 * Validate booking time against deadline
 */
function validateBookingTime(bookingTime, deadline, tournamentConfig) {
  const booking = parseDate(bookingTime);
  const dead = parseDate(deadline);

  if (!booking) {
    return { valid: false, error: "Booking time is required" };
  }

  // Check if booking is in the past
  const now = new Date();
  if (booking < now) {
    return { valid: false, error: "Cannot book a time in the past" };
  }

  // If deadline enforcement is enabled, validate against deadline
  if (tournamentConfig?.enforceDeadlines && dead) {
    if (booking > dead) {
      return {
        valid: false,
        error: `Booking time must be on or before deadline (${dead.toISOString()})`,
      };
    }
  }

  return { valid: true };
}

/**
 * Check if venue/table is available at booking time
 */
async function checkVenueAvailability(venueId, bookingTime, duration = 2, excludeMatchId = null) {
  if (!venueId || !bookingTime) return { available: true };

  const booking = parseDate(bookingTime);
  if (!booking) return { available: false, error: "Invalid booking time" };

  // Calculate end time (default 2 hours)
  const endTime = new Date(booking.getTime() + duration * 60 * 60 * 1000);

  // Check existing tournament matches at this venue
  const conflictingMatches = await TournamentMatch.findAll({
    where: {
      id: { [Op.ne]: excludeMatchId },
      venueId,
      bookingTime: { [Op.ne]: null },
      [Op.or]: [
        {
          bookingTime: {
            [Op.between]: [booking, endTime],
          },
        },
        // Check if existing booking overlaps
        {
          bookingTime: {
            [Op.lte]: booking,
          },
          // Assuming 2-hour matches by default
        },
      ],
    },
  });

  if (conflictingMatches.length > 0) {
    return {
      available: false,
      error: "Venue has a conflicting booking at this time",
      conflicts: conflictingMatches.map((m) => ({
        matchId: m.id,
        bookingTime: m.bookingTime,
      })),
    };
  }

  // Check venue booking system
  try {
    const existingBookings = await Booking.findAll({
      where: {
        venueId,
        status: { [Op.in]: ["confirmed", "pending"] },
        startTime: { [Op.lte]: endTime },
        endTime: { [Op.gte]: booking },
      },
    });

    if (existingBookings.length > 0) {
      return {
        available: false,
        error: "Venue has existing bookings at this time",
      };
    }
  } catch (err) {
    console.warn("Could not check venue bookings:", err.message);
  }

  return { available: true };
}

/**
 * Book a match time for flexible scheduling
 */
async function bookMatchTime(matchId, bookingTime, playerId, venueId = null) {
  const match = await TournamentMatch.findByPk(matchId);
  if (!match) {
    return { success: false, error: "Match not found" };
  }

  const tournament = await Tournament.findByPk(match.tournamentId);
  if (!tournament) {
    return { success: false, error: "Tournament not found" };
  }

  const config = getSchedulingConfigFromTournament(tournament);

  // Check if flexible scheduling is enabled
  if (!config.flexibleScheduling) {
    return {
      success: false,
      error: "Flexible scheduling is not enabled for this tournament",
    };
  }

  // Validate booking time
  const validation = validateBookingTime(bookingTime, match.scheduledDeadline, config);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Check venue availability
  const venue = venueId || match.venueId;
  if (venue) {
    const availability = await checkVenueAvailability(venue, bookingTime, 2, matchId);
    if (!availability.available) {
      return { success: false, error: availability.error };
    }
  }

  // Update match with booking
  await match.update({
    bookingTime: parseDate(bookingTime),
    bookingConfirmedBy: playerId,
    bookingConfirmedAt: new Date(),
    isScheduled: true,
    ...(venue && { venueId: venue }),
  });

  return { success: true, match };
}

/**
 * Cancel a match booking
 */
async function cancelMatchBooking(matchId, playerId) {
  const match = await TournamentMatch.findByPk(matchId);
  if (!match) {
    return { success: false, error: "Match not found" };
  }

  // Verify player is part of this match
  if (match.player1Id !== playerId && match.player2Id !== playerId) {
    return { success: false, error: "You are not a participant in this match" };
  }

  await match.update({
    bookingTime: null,
    bookingConfirmedBy: null,
    bookingConfirmedAt: null,
    isScheduled: false,
  });

  return { success: true };
}

module.exports = {
  normalizeSchedulingConfig,
  getSchedulingConfigFromTournament,
  applyAutoForfeitForTournament,
  processAutoForfeitForAllTournaments,
  validateBookingTime,
  checkVenueAvailability,
  bookMatchTime,
  cancelMatchBooking,
};
