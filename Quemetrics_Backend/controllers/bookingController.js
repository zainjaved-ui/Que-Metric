const { Op } = require("sequelize");
const sequelize = require("../config/db");
const {
  Booking,
  League,
  Fixture,
  Player,
  VenueOwner,
  Season,
  Game,
  User,
  Organization,
  Club,
  LeaguePlayer,
  Tournament,
  TournamentMatch,
  VenueRequest,
} = require("../models");
const {
  sendBookingCreatedEmail,
  sendTournamentBookingCreatedEmail,
  sendBookingConfirmedEmail,
  sendBookingRejectedEmail,
  sendBookingCancelledEmail
} = require("../utils/email");
const { resolveVenueOwnerMerged } = require("../utils/venueOwnerEmbedded");
const { ensureVenueOwnerVenuesColumn } = require("../utils/ensureVenueOwnerVenuesColumn");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeTimeHHMM = (t) => {
  if (t == null) return "";
  if (typeof t === "string") {
    const s = t.trim();
    return s.length >= 5 ? s.slice(0, 5) : s;
  }
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
};

const normalizeTableLabel = (s) => String(s || "").replace(/\s+/g, " ").trim();

const normalizeWeekdayName = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const aliases = {
    mon: "monday",
    tue: "tuesday",
    tues: "tuesday",
    wed: "wednesday",
    thu: "thursday",
    thur: "thursday",
    thurs: "thursday",
    fri: "friday",
    sat: "saturday",
    sun: "sunday",
  };
  return aliases[raw] || raw;
};

const timeToMinutes = (hhmm) => {
  const parts = String(hhmm || "").split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h)) return 0;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
};

/** True if [aStart,aEnd) overlaps [bStart,bEnd) */
const rangesOverlap = (aStart, aEnd, bStart, bEnd) => {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  if (ae <= as || be <= bs) return false;
  return as < be && bs < ae;
};

/** Match bookings for a venue id stored as venueId and/or venueOwnerId (UUID overlap). */
const buildVenueClauseForActiveBookings = (rawVenueId) => {
  const vid = String(rawVenueId || "").trim();
  const or = [{ venueId: vid }];
  if (UUID_RE.test(vid)) {
    or.push({ venueOwnerId: vid });
  }
  return { [Op.or]: or };
};

const tableNamesMatchForBooking = (bookingTableName, selectedTableName) => {
  const a = normalizeTableLabel(bookingTableName);
  const b = normalizeTableLabel(selectedTableName);
  if (!b) return false;
  if (!a) return false;
  return a === b;
};

/** Tournament row is safe to expose in player booking lists (exists, not archived/cancelled). */
const tournamentRowIsVisibleForPlayerBookings = (tournament) => {
  if (!tournament) return false;
  if (tournament.isArchived) return false;
  if (tournament.status === "cancelled" || tournament.status === "archived") return false;
  return true;
};

/**
 * Remove tournament bookings whose tournament was hard-deleted, soft-archived, or cancelled.
 * League bookings are unchanged.
 */
const filterBookingsForPlayerList = (bookingRows) =>
  bookingRows.filter((b) => {
    const isTournament =
      b.bookingType === "tournament" ||
      (b.tournamentId != null && String(b.tournamentId).trim() !== "");
    if (!isTournament) return true;
    return tournamentRowIsVisibleForPlayerBookings(b.tournament);
  });

const FINAL_MATCH_STATUSES = new Set(["completed", "voided", "walkover"]);

const bookingBlocksAvailability = (bookingRow) => {
  const b = bookingRow?.toJSON ? bookingRow.toJSON() : bookingRow;
  if (!b) return false;
  if (!["pending", "confirmed"].includes(String(b.status || "").toLowerCase())) return false;

  const isTournament =
    b.bookingType === "tournament" ||
    (b.tournamentId != null && String(b.tournamentId).trim() !== "");

  if (!isTournament) return true;

  const matchStatus = String(b.tournamentMatch?.status || "").toLowerCase();
  if (FINAL_MATCH_STATUSES.has(matchStatus)) {
    return false;
  }

  return true;
};

// ============================================
// HELPER FUNCTION: Get or Create Player Profile
// ============================================

/**
 * Gets all player profile IDs associated with a user's email.
 * Useful when users have accidentally created multiple profiles.
 */
const getAllPlayerIdsForUser = async (userId) => {
  const currentUser = await User.findByPk(userId);
  if (!currentUser) return [];

  const allUsersWithEmail = await User.findAll({
    where: { email: currentUser.email },
    attributes: ['id']
  });
  const userIds = allUsersWithEmail.map(u => u.id);

  const players = await Player.findAll({
    where: { userId: { [Op.in]: userIds } },
    attributes: ['id']
  });

  return players.map(p => p.id);
};

const toValidDate = (value) => {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfDayUTC = (value) => {
  const d = toValidDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
};

const endOfDayUTC = (value) => {
  const d = toValidDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
};

const normalizeVenueToken = (value) => String(value || "").replace(/^(venue_|virtual_)/, "").trim();

const parseVenueCollections = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : Object.values(parsed || {});
    } catch (_) {
      // If it's a string but NOT valid JSON, it might be a comma-separated list or a single name
      return raw.split(",").map(v => v.trim()).filter(Boolean);
    }
  }
  if (typeof raw === "object") return Object.values(raw || {});
  return [];
};

const parseJsonObject = (raw) => {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
};

const getTournamentDeadlineDate = (tournament) => {
  if (!tournament) return null;
  const privacy = parseJsonObject(tournament.privacySettings);
  const deadlineRaw = privacy?.matchDeadlineDate || null;
  const parsed = toValidDate(deadlineRaw);
  return parsed || null;
};

const resolveVenueById = async (venueId) => {
  if (!venueId) return null;
  await ensureVenueOwnerVenuesColumn();
  const venueIdStr = String(venueId).trim();

  // If venueId is in the format ownerId:venueRef, always resolve from VenueOwner.venues
  if (venueIdStr.includes(":")) {
    const [ownerId, venueRef] = venueIdStr.split(":");
    const venueOwner = await VenueOwner.findByPk(ownerId);
    if (venueOwner) {
      const ownerVenues = parseVenueCollections(venueOwner.venues);
      const matched = ownerVenues.find((v) => {
        const vid = String(v?.id || v?.venueId || "").trim();
        const vname = String(v?.name || v?.venueName || "").trim();
        return vid === String(venueRef).trim() || vname === String(venueRef).trim();
      });
      if (matched) {
        const tables = Array.isArray(matched.tables) ? matched.tables : [];
        const slots = Array.isArray(matched.slots) ? matched.slots : [];
        return {
          id: venueIdStr,
          venueName: matched.name || matched.venueName || venueOwner.venueName || "Venue",
          numberOfTables: tables.length || Number(venueOwner.numberOfTables) || 0,
          tables,
          slots,
        };
      }
      // If no match, still return venueOwner info but mark as external
      return {
        id: venueIdStr,
        venueName: venueOwner.venueName || venueOwner.name || "External Venue",
        numberOfTables: Number(venueOwner.numberOfTables) || 0,
        tables: [],
        slots: [],
        isExternalVenue: true,
      };
    }
    // If no venueOwner found, fallback
    return {
      id: venueIdStr,
      venueName: "External Venue",
      numberOfTables: 0,
      tables: [],
      slots: [],
      isExternalVenue: true,
    };
  }

  // If venueId is a UUID, try to resolve as VenueOwnerId
  if (UUID_RE.test(venueIdStr)) {
    const venueOwner = await VenueOwner.findByPk(venueIdStr);
    if (venueOwner) {
      // Use the same merging logic as buildTournamentVenueEntry
      const merged = await resolveVenueOwnerMerged(venueOwner, {
        clubId: null,
        organizationId: venueOwner.organizationId,
      });
      return {
        id: venueOwner.id,
        venueName: merged.displayName,
        numberOfTables: merged.tables.length,
        tables: merged.tables,
        slots: merged.slots,
      };
    }

    // Fallback: Search for the venue ID in all VenueOwners' venues arrays
    const allVenueOwners = await VenueOwner.findAll({ attributes: ["id", "venues", "venueName", "name", "numberOfTables"] });
    for (const vo of allVenueOwners) {
      const ownerVenues = parseVenueCollections(vo.venues);
      const matched = ownerVenues.find((v) => String(v?.id || v?.venueId || "").trim() === venueIdStr);
      if (matched) {
        const tables = Array.isArray(matched.tables) ? matched.tables : [];
        const slots = Array.isArray(matched.slots) ? matched.slots : [];
        return {
          id: venueIdStr,
          venueName: matched.name || matched.venueName || vo.venueName || vo.name || "Venue",
          numberOfTables: tables.length || Number(vo.numberOfTables) || 0,
          tables,
          slots,
          isVenueOwnerVenue: true,
        };
      }
    }

    // Also try clubs
    const allClubs = await Club.findAll({ attributes: ["id", "venues"] });
    for (const club of allClubs) {
      const clubVenues = parseVenueCollections(club.venues);
      const matched = clubVenues.find((v) => String(v?.id || v?.venueId || "").trim() === venueIdStr);
      if (matched) {
        const tables = Array.isArray(matched.tables) ? matched.tables : [];
        const slots = Array.isArray(matched.slots) ? matched.slots : [];
        return {
          id: venueIdStr,
          venueName: matched.name || matched.venueName || "Club Venue",
          numberOfTables: tables.length,
          tables,
          slots,
          isClubVenue: true,
        };
      }
    }

    // Not found anywhere
    return {
      id: venueIdStr,
      venueName: "External Venue",
      numberOfTables: 0,
      tables: [],
      slots: [],
      isExternalVenue: true,
    };
  }

  // If venueId is a club venue (starts with venue_ or virtual_), resolve from club venues
  if (venueIdStr.startsWith("venue_") || venueIdStr.startsWith("virtual_")) {
    const allClubs = await Club.findAll({ attributes: ["id", "venues"] });
    const reqNorm = normalizeVenueToken(venueIdStr);
    for (const club of allClubs) {
      const clubVenues = parseVenueCollections(club.venues);
      const matched = clubVenues.find((v) => normalizeVenueToken(v?.id || v?.venueId || v?.name) === reqNorm);
      if (!matched) continue;
      const tables = Array.isArray(matched.tables) ? matched.tables : [];
      const slots = Array.isArray(matched.slots) ? matched.slots : [];
      return {
        id: venueIdStr,
        venueName: matched.name || matched.venueName || "Club Venue",
        numberOfTables: tables.length,
        tables,
        slots,
      };
    }
    // Not found in any club
    return {
      id: venueIdStr,
      venueName: "Club Venue",
      numberOfTables: 0,
      tables: [],
      slots: [],
      isClubVenue: true,
    };
  }

  // Fallback: unknown venue
  return {
    id: venueIdStr,
    venueName: "Unknown Venue",
    numberOfTables: 0,
    tables: [],
    slots: [],
    isExternalVenue: true,
  };
};

/**
 * Resolve a single tournament venue token into the API payload shape.
 * Only tokens listed on the tournament are resolved — no club "default" injection.
 */
const buildTournamentVenueEntry = async (token, tournament) => {
  await ensureVenueOwnerVenuesColumn();
  const str = String(token || "").trim();
  if (!str) return null;

  if (str.includes(":") && !str.startsWith("venue_")) {
    const [ownerId, venueRef] = str.split(":");
    const venueOwner = await VenueOwner.findByPk(ownerId);
    if (!venueOwner) return null;
    const ownerVenues = parseVenueCollections(venueOwner.venues);
    const matched = ownerVenues.find((v) => {
      const vid = String(v?.id || v?.venueId || "").trim();
      const vname = String(v?.name || v?.venueName || "").trim();
      return vid === String(venueRef).trim() || vname === String(venueRef).trim();
    });
    const tables = matched && Array.isArray(matched.tables) ? matched.tables : [];
    const slots = matched && Array.isArray(matched.slots) ? matched.slots : [];
    const name = matched?.name || matched?.venueName || venueOwner.venueName || venueOwner.name || "Venue";
    const numTables = tables.length || Math.max(Number(venueOwner.numberOfTables) || 0, 2);
    const tableList = tables.length
      ? tables.map((t, idx) => (typeof t === "string" ? t.trim() : (t?.name || t?.label || `Table ${idx + 1}`)))
      : Array.from({ length: numTables }, (_, i) => `Table ${i + 1}`);
    return {
      id: str,
      sourceVenueId: matched?.id || venueRef,
      venueName: name,
      name,
      numberOfTables: tableList.length,
      address: matched?.address || venueOwner.address || "",
      facilities: matched?.facilities || venueOwner.facilities || "",
      openingHours: matched?.openingHours || venueOwner.openingHours || "",
      tables: tableList,
      slots,
      isVenueOwnerVenue: true,
    };
  }

  if (str.startsWith("venue_") || str.startsWith("virtual_")) {
    if (!tournament.clubId) return null;
    const club = await Club.findByPk(tournament.clubId);
    const arr = parseVenueCollections(club?.venues);
    const reqNorm = normalizeVenueToken(str);
    const v = arr.find((x) => {
      const xid = String(x?.id || x?.venueId || "").trim();
      return xid === str || normalizeVenueToken(xid) === reqNorm;
    });
    if (!v) return null;
    const rawId = String(v?.id || "");
    const prefixedId =
      rawId.startsWith("venue_") || rawId.startsWith("virtual_") ? rawId : str.startsWith("venue_") ? str : `venue_${rawId}`;
    const tables = Array.isArray(v.tables) ? v.tables : [];
    const slots = Array.isArray(v.slots) ? v.slots : [];
    return {
      id: prefixedId,
      sourceVenueId: rawId,
      venueName: v.name || v.venueName || "Club Venue",
      name: v.name || v.venueName || "Club Venue",
      numberOfTables: tables.length,
      address: v.address || "Club Venue",
      facilities: v.facilities || "Cue Sports Facilities",
      openingHours: v.openingHours || "Contact club for details",
      tables,
      slots,
      isClubVenue: true,
    };
  }

  const venueOwner = await VenueOwner.findByPk(str);
  if (venueOwner) {
    const merged = await resolveVenueOwnerMerged(venueOwner, {
      clubId: tournament.clubId,
      organizationId: venueOwner.organizationId,
    });
    return {
      id: venueOwner.id,
      sourceVenueId: venueOwner.id,
      venueName: merged.displayName,
      name: merged.displayName,
      numberOfTables: merged.tables.length,
      address: venueOwner.address || "",
      facilities: venueOwner.facilities || "",
      openingHours: venueOwner.openingHours || "",
      tables: merged.tables,
      slots: merged.slots,
      isVenueOwnerVenue: true,
    };
  }

  if (tournament.clubId) {
    const club = await Club.findByPk(tournament.clubId);
    const arr = parseVenueCollections(club?.venues);
    const v = arr.find((x) => String(x?.id || x?.venueId || "").trim() === str);
    if (v) {
      const rawId = String(v?.id || "");
      const prefixedId =
        rawId.startsWith("venue_") || rawId.startsWith("virtual_") ? rawId : `venue_${rawId}`;
      const tables = Array.isArray(v.tables) ? v.tables : [];
      const slots = Array.isArray(v.slots) ? v.slots : [];
      return {
        id: prefixedId,
        sourceVenueId: rawId,
        venueName: v.name || v.venueName || "Club Venue",
        name: v.name || v.venueName || "Club Venue",
        numberOfTables: tables.length,
        address: v.address || "Club Venue",
        facilities: v.facilities || "Cue Sports Facilities",
        openingHours: v.openingHours || "Contact club for details",
        tables,
        slots,
        isClubVenue: true,
      };
    }
  }

  return null;
};

/**
 * Gets the player profile for a user, creating it if necessary
 * Used to ensure Player profile exists for booking operations
 * @param {string} userId - The user ID
 * @returns {Object} Player profile object or null if no player profile exists
 */
const getOrCreatePlayerProfile = async (userId) => {
  try {
    // 1. Get the current user to find their email
    const currentUser = await User.findByPk(userId);
    if (!currentUser) {
      return null;
    }

    // 2. Find ALL users with this email (e.g., both 'organization' and 'player' roles)
    const allUsersWithEmail = await User.findAll({
      where: { email: currentUser.email },
      attributes: ['id', 'role']
    });
    const userIds = allUsersWithEmail.map(u => u.id);

    // 3. Try to find an existing player profile linked to ANY of these user IDs
    let player = await Player.findOne({
      where: { userId: { [Op.in]: userIds } },
      order: [['createdAt', 'ASC']]
    });

    if (player) {
      return player;
    }

    // 4. If no player profile exists, we want to create one for the user account with the 'player' role
    // If multiple exist (unlikely but possible), prefer the one with role='player'
    let playerUser = allUsersWithEmail.find(u => u.role === 'player');

    // Fallback to current user if they are a player, or just use the first 'player' account if it exists
    if (!playerUser && currentUser.role === 'player') {
      playerUser = currentUser;
    }

    if (!playerUser) {
      return null;
    }

    // Auto-create player profile for the player-role user account
    player = await Player.create({
      userId: playerUser.id,
      name: currentUser.email.split("@")[0] || "Player",
      badgeType: "Casual"
    });

    return player;
  } catch (error) {
    throw error;
  }
};

// ============================================
// GET SNOOKER LEAGUES FOR PLAYER
// ============================================

/**
 * Get all snooker leagues where the logged-in player has matches
 * Returns leagues with booking date ranges and match count
 */
exports.getSnookerLeagues = async (req, res) => {
  try {
    const { userId } = req.user;

    // Get or create the player profile
    // Get all player profile IDs for this user's email (multi-role support)
    const playerIds = await getAllPlayerIdsForUser(userId);

    if (!playerIds || playerIds.length === 0) {
      res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
      return res.status(404).json({ success: false, error: "No player profiles found. Please ensure you have a player profile linked to your account." });
    }


    // Find all fixtures where any of the player's profiles is either player1 or player2
    const fixtures = await Fixture.findAll({
      where: {
        [Op.or]: [
          { player1Id: { [Op.in]: playerIds } },
          { player2Id: { [Op.in]: playerIds } }
        ],
        status: {
          [Op.in]: ["scheduled", "upcoming", "in_progress"]
        }
      },
      include: [
        {
          association: "league",
          required: true,
          where: {
            sport: { [Op.in]: ["snooker", "Snooker"] },
            status: "active"
          },
          include: [
            {
              association: "season",
              required: true,
              attributes: ["id", "name", "startDate", "endDate"]
            },
            {
              association: "leaguePlayers",
              attributes: ["playerId"]
            }
          ]
        }
      ]
    });


    // If no fixtures found with player, return all active snooker leagues as options
    if (fixtures.length === 0) {


      // Fetch only leagues where the user is a registered player (fully in DB)
      const leagues = await League.findAll({
        where: {
          sport: { [Op.in]: ["snooker", "Snooker"] },
          status: "active"
        },
        include: [
          {
            association: "leaguePlayers",
            required: true,
            attributes: ["playerId"],
            where: { playerId: { [Op.in]: playerIds } }
          },
          {
            association: "season",
            required: false,
            attributes: ["id", "name", "startDate", "endDate"]
          }
        ]
      });

      const result = leagues.map(league => ({
        id: league.id,
        name: league.name,
        seasonName: league.season?.name || "Unknown Season",
        bookingStartDate: league.season?.startDate || league.leagueStartDate,
        bookingEndDate: league.season?.endDate || league.leagueEndDate,
        leagueStartDate: league.leagueStartDate || league.season?.startDate,
        leagueEndDate: league.leagueEndDate || league.season?.endDate,
        matchCount: 0,
        sport: league.sport,
        format: league.format,
        venueIds: league.venueIds || [],
        note: "No scheduled matches yet. Available for booking.",
        leaguePlayers: league.leaguePlayers || []
      }));

      res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
      return res.json({
        success: true,
        data: result,
        message: `No matches scheduled yet. Showing ${result.length} available snooker league(s).`
      });
    }

    // Group fixtures by league and calculate match counts
    const leagueMap = new Map();

    fixtures.forEach((fixture) => {
      const league = fixture.league;
      if (!leagueMap.has(league.id)) {
        leagueMap.set(league.id, {
          id: league.id,
          name: league.name,
          seasonName: league.season?.name || "Unknown Season",
          bookingStartDate: league.season?.startDate || league.leagueStartDate,
          bookingEndDate: league.season?.endDate || league.leagueEndDate,
          leagueStartDate: league.leagueStartDate || league.season?.startDate,
          leagueEndDate: league.leagueEndDate || league.season?.endDate,
          matchCount: 0,
          sport: league.sport,
          format: league.format,
          venueIds: league.venueIds || [],
          leaguePlayers: league.leaguePlayers || []
        });
      }
      leagueMap.get(league.id).matchCount++;
    });

    const leagues = Array.from(leagueMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );


    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.json({
      success: true,
      data: leagues,
      message: "Snooker leagues retrieved successfully"
    });
  } catch (error) {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// GET POOL LEAGUES FOR PLAYER
// ============================================

/**
 * Get all pool leagues where the logged-in player has matches
 * Returns leagues with booking date ranges and match count
 */
exports.getPoolLeagues = async (req, res) => {
  try {
    const { userId } = req.user;

    // Get or create the player profile
    const player = await getOrCreatePlayerProfile(userId);

    if (!player) {
      return res.status(404).json({ success: false, error: "No player profile found. Please ensure you have a player profile linked to your account." });
    }


    // Find all fixtures where this player is either player1 or player2
    const fixtures = await Fixture.findAll({
      where: {
        [Op.or]: [
          { player1Id: player.id },
          { player2Id: player.id }
        ],
        status: {
          [Op.in]: ["scheduled", "upcoming", "in_progress"]
        }
      },
      include: [
        {
          association: "league",
          required: true,
          where: {
            sport: { [Op.in]: ["pool", "Pool"] },
            status: "active"
          },
          include: [
            {
              association: "season",
              required: true,
              attributes: ["id", "name", "startDate", "endDate"]
            },
            {
              association: "leaguePlayers",
              attributes: ["playerId"]
            }
          ]
        }
      ]
    });


    // If no fixtures found with player, return all active pool leagues as options
    if (fixtures.length === 0) {

      const allLeagues = await League.findAll({
        where: {
          sport: { [Op.in]: ["pool", "Pool"] },
          status: "active"
        },
        include: [
          {
            association: "season",
            required: true,
            attributes: ["id", "name", "startDate", "endDate"]
          },
          {
            association: "leaguePlayers",
            attributes: ["playerId"]
          }
        ]
      });

      const leagues = allLeagues.map(league => ({
        id: league.id,
        name: league.name,
        seasonName: league.season?.name || "Unknown Season",
        bookingStartDate: league.season?.startDate || league.leagueStartDate,
        bookingEndDate: league.season?.endDate || league.leagueEndDate,
        leagueStartDate: league.leagueStartDate || league.season?.startDate,
        leagueEndDate: league.leagueEndDate || league.season?.endDate,
        matchCount: 0,
        sport: league.sport,
        format: league.format,
        venueIds: league.venueIds || [],
        note: "No scheduled matches yet. Available for booking.",
        leaguePlayers: league.leaguePlayers || []
      }));

      return res.json({
        success: true,
        data: leagues,
        message: `No matches scheduled yet. Showing ${leagues.length} available pool league(s).`
      });
    }

    // Group fixtures by league and calculate match counts
    const leagueMap = new Map();

    fixtures.forEach((fixture) => {
      const league = fixture.league;
      if (!leagueMap.has(league.id)) {
        leagueMap.set(league.id, {
          id: league.id,
          name: league.name,
          seasonName: league.season?.name || "Unknown Season",
          bookingStartDate: league.season?.startDate || league.leagueStartDate,
          bookingEndDate: league.season?.endDate || league.leagueEndDate,
          leagueStartDate: league.leagueStartDate || league.season?.startDate,
          leagueEndDate: league.leagueEndDate || league.season?.endDate,
          matchCount: 0,
          sport: league.sport,
          format: league.format,
          venueIds: league.venueIds || [],
          leaguePlayers: league.leaguePlayers || []
        });
      }
      leagueMap.get(league.id).matchCount++;
    });

    const leagues = Array.from(leagueMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );


    res.json({
      success: true,
      data: leagues,
      message: "Pool leagues retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// GET POKER LEAGUES FOR PLAYER
// ============================================

/**
 * Get all poker leagues where the logged-in player has matches
 * Returns leagues with booking date ranges and match count
 */
exports.getPokerLeagues = async (req, res) => {
  try {
    const { userId } = req.user;

    // Get or create the player profile
    const player = await getOrCreatePlayerProfile(userId);

    if (!player) {
      return res.status(404).json({ success: false, error: "No player profile found. Please ensure you have a player profile linked to your account." });
    }


    // Find all fixtures where this player is either player1 or player2
    const fixtures = await Fixture.findAll({
      where: {
        [Op.or]: [
          { player1Id: player.id },
          { player2Id: player.id }
        ],
        status: {
          [Op.in]: ["scheduled", "upcoming", "in_progress"]
        }
      },
      include: [
        {
          association: "league",
          required: true,
          where: {
            sport: { [Op.in]: ["poker", "pooker", "Poker", "Pooker"] },
            status: "active"
          },
          include: [
            {
              association: "season",
              required: true,
              attributes: ["id", "name", "startDate", "endDate"]
            },
            {
              association: "leaguePlayers",
              attributes: ["playerId"]
            }
          ]
        }
      ]
    });

    // If no fixtures found with player, return all active poker leagues as options
    if (fixtures.length === 0) {
      const allLeagues = await League.findAll({
        where: {
          sport: { [Op.in]: ["poker", "pooker", "Poker", "Pooker"] },
          status: "active"
        },
        include: [
          {
            association: "season",
            required: false,
            attributes: ["id", "name", "startDate", "endDate"]
          }
        ]
      });

      const leagues = allLeagues.map(league => ({
        id: league.id,
        name: league.name,
        seasonName: league.season?.name || "Unknown Season",
        bookingStartDate: league.season?.startDate || league.leagueStartDate,
        bookingEndDate: league.season?.endDate || league.leagueEndDate,
        leagueStartDate: league.leagueStartDate || league.season?.startDate,
        leagueEndDate: league.leagueEndDate || league.season?.endDate,
        matchCount: 0,
        sport: league.sport,
        format: league.format,
        venueIds: league.venueIds || [],
        note: "No scheduled matches yet. Available for booking.",
        leaguePlayers: league.leaguePlayers || []
      }));

      return res.json({
        success: true,
        data: leagues,
        message: `No matches scheduled yet. Showing ${leagues.length} available poker league(s).`
      });
    }

    // Group fixtures by league
    const leagueMap = new Map();
    fixtures.forEach((fixture) => {
      const league = fixture.league;
      if (!leagueMap.has(league.id)) {
        leagueMap.set(league.id, {
          id: league.id,
          name: league.name,
          seasonName: league.season?.name || "Unknown Season",
          bookingStartDate: league.season?.startDate || league.leagueStartDate,
          bookingEndDate: league.season?.endDate || league.leagueEndDate,
          leagueStartDate: league.leagueStartDate || league.season?.startDate,
          leagueEndDate: league.leagueEndDate || league.season?.endDate,
          matchCount: 0,
          sport: league.sport,
          format: league.format,
          venueIds: league.venueIds || [],
          leaguePlayers: league.leaguePlayers || []
        });
      }
      leagueMap.get(league.id).matchCount++;
    });

    const leagues = Array.from(leagueMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    res.json({
      success: true,
      data: leagues,
      message: "Poker leagues retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// GET MATCHES FOR A LEAGUE
// ============================================

/**
 * Get all matches for a specific league where the logged-in player participates
 * Returns match details with opponent name dynamically determined
 */
exports.getLeagueMatches = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;

    // Get or create the player profile
    const player = await getOrCreatePlayerProfile(userId);

    if (!player) {
      return res.status(404).json({ success: false, error: "No player profile found. Please ensure you have a player profile linked to your account." });
    }

    // Verify league exists and is snooker
    const league = await League.findOne({
      where: {
        id: leagueId
      },
      include: [
        {
          association: "season",
          attributes: ["id", "name", "startDate", "endDate"]
        }
      ]
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found or not a snooker league" });
    }

    // Find all fixtures for this league where player is participant
    const playerIds = await getAllPlayerIdsForUser(userId);
    const fixtures = await Fixture.findAll({
      where: {
        leagueId,
        [Op.or]: [
          { player1Id: { [Op.in]: playerIds } },
          { player2Id: { [Op.in]: playerIds } }
        ],
        status: {
          [Op.in]: ["scheduled", "upcoming", "in_progress"]
        }
      },
      include: [
        {
          association: "player1",
          attributes: ["id", "name", "nickname"],
          include: [
            {
              association: "user",
              attributes: ["email"]
            }
          ]
        },
        {
          association: "player2",
          attributes: ["id", "name", "nickname"],
          include: [
            {
              association: "user",
              attributes: ["email"]
            }
          ]
        },
        {
          association: "league",
          attributes: ["id", "name", "sport"]
        }
      ],
      order: [["round", "ASC"], ["matchNumber", "ASC"]]
    });

    // Find existing bookings for these fixtures
    const fixtureIds = fixtures.map(f => f.id);
    const existingBookings = await Booking.findAll({
      where: {
        fixtureId: { [Op.in]: fixtureIds },
        status: { [Op.in]: ["pending", "confirmed"] }
      },
      attributes: ["id", "fixtureId", "status"]
    });
    const bookingsByFixture = {};
    existingBookings.forEach(b => {
      bookingsByFixture[b.fixtureId] = { id: b.id, status: b.status };
    });

    // Format matches with opponent info
    const matches = fixtures.map((fixture) => {
      // Check which spot the logged-in user occupies
      const isPlayer1 = fixture.player1?.user?.email === req.user?.email ||
        playerIds.includes(fixture.player1Id);
      const opponent = isPlayer1 ? fixture.player2 : fixture.player1;
      const opponentName = opponent?.nickname || opponent?.name || "TBD";

      return {
        matchId: fixture.id,
        fixtureId: fixture.id,
        leagueId: league.id,
        leagueName: league.name,
        round: fixture.round,
        matchNumber: fixture.matchNumber,
        opponentId: opponent?.id,
        opponentName: `vs ${opponentName}`,
        bookingStartDate: league.season?.startDate || league.leagueStartDate,
        bookingEndDate: league.season?.endDate || league.leagueEndDate,
        leagueStartDate: league.leagueStartDate || league.season?.startDate,
        leagueEndDate: league.leagueEndDate || league.season?.endDate,
        scheduledDate: fixture.scheduledDate,
        status: fixture.status,
        player1Id: fixture.player1Id,
        player2Id: fixture.player2Id,
        isPlayer1: isPlayer1,
        hasBooking: !!bookingsByFixture[fixture.id],
        bookingStatus: bookingsByFixture[fixture.id]?.status || null,
        bookingId: bookingsByFixture[fixture.id]?.id || null
      };
    });

    res.json({
      success: true,
      data: {
        league: {
          id: league.id,
          name: league.name,
          seasonName: league.season?.name,
          bookingStartDate: league.season?.startDate || league.leagueStartDate,
          bookingEndDate: league.season?.endDate || league.leagueEndDate,
          leagueStartDate: league.leagueStartDate || league.season?.startDate,
          leagueEndDate: league.leagueEndDate || league.season?.endDate
        },
        matches
      },
      message: "League matches retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get all pool matches for a specific league where the logged-in player participates
 */
exports.getPoolMatches = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;

    // Get or create the player profile
    const player = await getOrCreatePlayerProfile(userId);

    if (!player) {
      return res.status(404).json({ success: false, error: "No player profile found. Please ensure you have a player profile linked to your account." });
    }

    // Verify league exists and is pool
    const league = await League.findOne({
      where: {
        id: leagueId,
        sport: { [Op.in]: ["pool", "Pool"] }
      },
      include: [
        {
          association: "season",
          attributes: ["id", "name", "startDate", "endDate"]
        }
      ]
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found or not a pool league" });
    }

    // Find all fixtures for this league where player is participant
    const playerIds = await getAllPlayerIdsForUser(userId);
    const fixtures = await Fixture.findAll({
      where: {
        leagueId,
        [Op.or]: [
          { player1Id: { [Op.in]: playerIds } },
          { player2Id: { [Op.in]: playerIds } }
        ],
        status: {
          [Op.in]: ["scheduled", "upcoming", "in_progress"]
        }
      },
      include: [
        {
          association: "player1",
          attributes: ["id", "name", "nickname"],
          include: [
            {
              association: "user",
              attributes: ["email"]
            }
          ]
        },
        {
          association: "player2",
          attributes: ["id", "name", "nickname"],
          include: [
            {
              association: "user",
              attributes: ["email"]
            }
          ]
        },
        {
          association: "league",
          attributes: ["id", "name", "sport"]
        }
      ],
      order: [["round", "ASC"], ["matchNumber", "ASC"]]
    });

    // Find existing bookings for these fixtures
    const fixtureIds = fixtures.map(f => f.id);
    const existingBookings = await Booking.findAll({
      where: {
        fixtureId: { [Op.in]: fixtureIds },
        status: { [Op.in]: ["pending", "confirmed"] }
      },
      attributes: ["id", "fixtureId", "status"]
    });
    const bookingsByFixture = {};
    existingBookings.forEach(b => {
      bookingsByFixture[b.fixtureId] = { id: b.id, status: b.status };
    });

    // Format matches with opponent info
    const matches = fixtures.map((fixture) => {
      // Check which spot the logged-in user occupies
      const isPlayer1 = fixture.player1?.user?.email === req.user?.email ||
        playerIds.includes(fixture.player1Id);
      const opponent = isPlayer1 ? fixture.player2 : fixture.player1;
      const opponentName = opponent?.nickname || opponent?.name || "TBD";

      return {
        matchId: fixture.id,
        fixtureId: fixture.id,
        leagueId: league.id,
        leagueName: league.name,
        round: fixture.round,
        matchNumber: fixture.matchNumber,
        opponentId: opponent?.id,
        opponentName: `vs ${opponentName}`,
        bookingStartDate: league.season?.startDate || league.leagueStartDate,
        bookingEndDate: league.season?.endDate || league.leagueEndDate,
        leagueStartDate: league.leagueStartDate || league.season?.startDate,
        leagueEndDate: league.leagueEndDate || league.season?.endDate,
        sport: "pool",
        hasBooking: !!bookingsByFixture[fixture.id],
        bookingStatus: bookingsByFixture[fixture.id]?.status || null,
        bookingId: bookingsByFixture[fixture.id]?.id || null
      };
    });

    res.json({
      success: true,
      data: {
        matches
      },
      message: "Pool league matches retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get all poker matches for a specific league where the logged-in player participates
 */
exports.getPokerMatches = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;

    const player = await getOrCreatePlayerProfile(userId);

    if (!player) {
      return res.status(404).json({ success: false, error: "No player profile found. Please ensure you have a player profile linked to your account." });
    }

    // Verify league exists and is poker
    // Ensure we find the league even if it was originally marked as poker
    const league = await League.findOne({
      where: {
        id: leagueId,
        sport: { [Op.in]: ["poker", "pooker", "Poker", "Pooker"] }
      },
      include: [
        {
          association: "season",
          attributes: ["id", "name", "startDate", "endDate"]
        }
      ]
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found or not a poker league" });
    }

    // Find all fixtures for this league where player is participant
    const playerIds = await getAllPlayerIdsForUser(userId);
    const fixtures = await Fixture.findAll({
      where: {
        leagueId,
        [Op.or]: [
          { player1Id: { [Op.in]: playerIds } },
          { player2Id: { [Op.in]: playerIds } }
        ],
        status: {
          [Op.in]: ["scheduled", "upcoming", "in_progress"]
        }
      },
      include: [
        {
          association: "player1",
          attributes: ["id", "name", "nickname"],
          include: [{ association: "user", attributes: ["email"] }]
        },
        {
          association: "player2",
          attributes: ["id", "name", "nickname"],
          include: [{ association: "user", attributes: ["email"] }]
        },
        {
          association: "league",
          attributes: ["id", "name", "sport"]
        }
      ],
      order: [["round", "ASC"], ["matchNumber", "ASC"]]
    });

    // Find existing bookings for these fixtures
    const fixtureIds = fixtures.map(f => f.id);
    const existingBookings = await Booking.findAll({
      where: {
        fixtureId: { [Op.in]: fixtureIds },
        status: { [Op.in]: ["pending", "confirmed"] }
      },
      attributes: ["id", "fixtureId", "status"]
    });
    const bookingsByFixture = {};
    existingBookings.forEach(b => {
      bookingsByFixture[b.fixtureId] = { id: b.id, status: b.status };
    });

    // Format matches with opponent info
    const matches = fixtures.map((fixture) => {
      // Check which spot the logged-in user occupies
      const isPlayer1 = fixture.player1?.user?.email === req.user?.email ||
        playerIds.includes(fixture.player1Id);

      const opponent = isPlayer1 ? fixture.player2 : fixture.player1;
      const opponentName = opponent?.nickname || opponent?.name || "TBD";

      return {
        matchId: fixture.id,
        fixtureId: fixture.id,
        leagueId: league.id,
        leagueName: league.name,
        round: fixture.round,
        matchNumber: fixture.matchNumber,
        opponentId: opponent?.id,
        opponentName: `vs ${opponentName}`,
        bookingStartDate: league.season?.startDate || league.leagueStartDate,
        bookingEndDate: league.season?.endDate || league.leagueEndDate,
        leagueStartDate: league.leagueStartDate || league.season?.startDate,
        leagueEndDate: league.leagueEndDate || league.season?.endDate,
        sport: "poker",
        hasBooking: !!bookingsByFixture[fixture.id],
        bookingStatus: bookingsByFixture[fixture.id]?.status || null,
        bookingId: bookingsByFixture[fixture.id]?.id || null
      };
    });

    res.json({
      success: true,
      data: { matches },
      message: "Poker league matches retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// GET AVAILABLE VENUES
// ============================================

/**
 * Get available venues for a specific league
 * If leagueId is provided, returns only venues for that league
 * Otherwise returns all available venues
 */
exports.getAvailableVenues = async (req, res) => {
  const leagueId = req.query.leagueId;
  // If leagueId provided, return ONLY the venues for that league
  if (leagueId) {
    let venueIdsList = [];
    const { VenueOwner, Club } = require("../models");

    const league = await League.findByPk(leagueId);
    if (!league) {
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      return res.status(404).json({ success: false, error: "League not found" });
    }

    console.log('[getAvailableVenues] League found:', { id: league.id, name: league.name, venueOwnerId: league.venueOwnerId });
    console.log('[getAvailableVenues] Raw league.venueIds:', league.venueIds, 'Type:', typeof league.venueIds);
    console.log('[getAvailableVenues] Raw league.venueOwnerId:', league.venueOwnerId);

    // Only use venueOwnerId fallback if venueIds is empty or not set
    // Parse venueIds - handle both string and array formats
    // venueIdsList already declared above, just reuse it here
    if (league.venueIds) {
      try {
        let processedValue = league.venueIds;
        console.log('[getAvailableVenues] Processing venueIds...');

        // Keep parsing as long as it's a string and looks like JSON
        let safety = 0;
        while (typeof processedValue === 'string' && safety < 5) {
          const trimmed = processedValue.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
            try {
              processedValue = JSON.parse(processedValue);
            } catch (e) {
              break;
            }
          } else {
            break;
          }
          safety++;
        }

        if (Array.isArray(processedValue)) {
          venueIdsList = processedValue;
        } else if (typeof processedValue === 'object' && processedValue !== null) {
          venueIdsList = Object.values(processedValue);
        } else if (processedValue) {
          venueIdsList = [processedValue];
        }

        console.log('[getAvailableVenues] Parsed venueIdsList:', venueIdsList);
      } catch (e) {
        console.error('[getAvailableVenues] Error parsing venueIds:', e.message);
        venueIdsList = [league.venueIds];
      }
    }

    if (!Array.isArray(venueIdsList)) {
      venueIdsList = venueIdsList ? [venueIdsList] : [];
    }

    console.log('[getAvailableVenues] Final venueIdsList:', venueIdsList, 'Length:', venueIdsList.length);

    // CRITICAL FIX: No fallback venues allowed - only return venues explicitly selected during league creation
    // If venueIds is empty or not set, this league has no approved venues
    if (!venueIdsList || venueIdsList.length === 0) {
      console.log('[getAvailableVenues] No venues selected for this league - returning empty list');
      return res.json({
        success: true,
        data: [],
        message: "No venues have been approved for this league. Contact league creator to add venues."
      });
    }

    // Parse venueIds - handle both string and array formats
    let venues = [];

    // Match venues from venueIdsList ONLY - no fallback to venueOwnerId
    // 1. Find venues from all clubs that match venueIdsList
    console.log('[getAvailableVenues] Step 3: Searching venues in clubs. venueIdsList:', venueIdsList);
    if (venueIdsList.length > 0) {
      const allClubs = await Club.findAll();
      console.log('[getAvailableVenues] Total clubs to search:', allClubs.length);

      for (const club of allClubs) {
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

        console.log(`[getAvailableVenues] Club ${club.id} has ${clubVenues.length} venues`);

        // Find matching venues by name OR id
        const matchedVenues = clubVenues.filter(venue => {
          const vName = (venue.name || '').toLowerCase().trim();
          const vId = (venue.id || venue.venueId || '').toLowerCase().trim();
          const isMatch = venueIdsList.some(vid => {
            const vidStr = String(vid).toLowerCase().trim();
            return vName === vidStr || vId === vidStr;
          });
          if (isMatch) {
            console.log(`[getAvailableVenues] Venue matched: ${venue.name} (id: ${venue.id})`);
          }
          return isMatch;
        });

        if (matchedVenues.length > 0) {
          const clubTransformed = matchedVenues.map((v) => ({
            id: v.id,
            venueName: v.name,
            name: v.name,
            numberOfTables: Array.isArray(v.tables) ? v.tables.length : 0,
            address: 'Club Venue',
            facilities: 'Cue Sports Facilities',
            openingHours: 'Contact club for details',
            tables: Array.isArray(v.tables) ? v.tables : [],
            slots: Array.isArray(v.slots) ? v.slots : [],
            isClubVenue: true,
            createdAt: v.createdAt,
            createdBy: v.createdBy
          }));
          venues.push(...clubTransformed);
        }
      }
    }

    console.log('[getAvailableVenues] Found venues after club search:', venues.length);

    // 2. Find venues from all venueOwners that match venueIdsList
    // venueIdsList format: "venueOwnerId:venueId" (e.g., "0a236174-2aa5:venue_1774597815801")
    if (venueIdsList.length > 0) {
      const allVenueOwners = await VenueOwner.findAll();
      // Fetch all clubs once to search for venue details
      const allClubsForVenueDetails = await Club.findAll({ attributes: ["id", "venues"] });
      console.log('[getAvailableVenues] Total VenueOwners to search:', allVenueOwners.length);

      for (const vidRaw of venueIdsList) {
        const vidStr = String(vidRaw).toLowerCase().trim();
        console.log(`[getAvailableVenues] Processing venueId: ${vidStr}`);

        // Parse composite ID format: "venueOwnerId:venueId"
        let voIdToMatch = vidStr;
        let venueIdToMatch = null;

        if (vidStr.includes(':')) {
          const parts = vidStr.split(':');
          voIdToMatch = parts[0];
          venueIdToMatch = parts.slice(1).join(':'); // Handle IDs with colons
        }

        console.log(`[getAvailableVenues] Looking for VenueOwner ID: ${voIdToMatch}, Venue ID: ${venueIdToMatch}`);

        // Find matching VenueOwner
        const matchingVO = allVenueOwners.find(vo =>
          String(vo.id).toLowerCase() === voIdToMatch ||
          String(vo.id).toLowerCase().includes(voIdToMatch) ||
          voIdToMatch.includes(String(vo.id).toLowerCase())
        );

        if (!matchingVO) {
          console.log(`[getAvailableVenues] No VenueOwner found for ID: ${voIdToMatch}`);
          continue;
        }

        console.log(`[getAvailableVenues] Found matching VenueOwner: ${matchingVO.id} (${matchingVO.venueName})`);

        // Check if venueId matches in VenueOwner.venueIds array
        let voVenueIds = [];
        if (matchingVO.venueIds) {
          if (Array.isArray(matchingVO.venueIds)) {
            voVenueIds = matchingVO.venueIds;
          } else if (typeof matchingVO.venueIds === 'string') {
            try {
              voVenueIds = JSON.parse(matchingVO.venueIds);
              if (!Array.isArray(voVenueIds)) {
                voVenueIds = [matchingVO.venueIds];
              }
            } catch (e) {
              voVenueIds = [matchingVO.venueIds];
            }
          }
        }

        console.log(`[getAvailableVenues] VenueOwner ${matchingVO.id} venueIds:`, voVenueIds);

        // If a specific venue ID is requested, filter to only that one
        let venuesToReturn = voVenueIds;
        if (venueIdToMatch) {
          const matchedVenueId = voVenueIds.find(vid =>
            String(vid).toLowerCase() === venueIdToMatch
          );

          if (!matchedVenueId) {
            console.log(`[getAvailableVenues] ✗ Venue ID ${venueIdToMatch} not found in VenueOwner ${matchingVO.id}`);
            continue;
          }

          venuesToReturn = [matchedVenueId];
          console.log(`[getAvailableVenues] ✓ Found matching venue: ${matchedVenueId}`);
        }

        // Transform to response format (only the specific venue or all if none specified)
        // Parse venues array to get specific venue names, tables, and slots
        // Note: VenueOwner.venues might be empty; venue details could be in Club.venues
        const ownerVenues = parseVenueCollections(matchingVO.venues);

        const venuesToAdd = await Promise.all(venuesToReturn.map(async (venueId) => {
          let specificVenue = null;

          // First, try to find in VenueOwner.venues array
          specificVenue = ownerVenues.find(v => {
            const vid = String(v?.id || v?.venueId || '').trim();
            const vname = String(v?.name || v?.venueName || '').trim();
            return vid === String(venueId).trim() || vname === String(venueId).trim();
          });

          // If not found, search in Club.venues (already fetched above)
          if (!specificVenue) {
            for (const club of allClubsForVenueDetails) {
              const clubVenues = parseVenueCollections(club.venues);
              specificVenue = clubVenues.find(v => {
                const vid = String(v?.id || v?.venueId || '').trim();
                return vid === String(venueId).trim();
              });
              if (specificVenue) break;
            }
          }

          // Extract venue details
          const displayName = specificVenue
            ? (specificVenue.name || specificVenue.venueName || matchingVO.venueName || 'Venue')
            : (matchingVO.venueName || 'Venue');

          const tables = specificVenue && Array.isArray(specificVenue.tables) ? specificVenue.tables : [];
          const slots = specificVenue && Array.isArray(specificVenue.slots) ? specificVenue.slots : [];
          const numTables = tables.length || Number(matchingVO.numberOfTables) || 0;

          // Generate table list if tables exist
          const tableList = tables.length
            ? tables.map((t, idx) => (typeof t === 'string' ? t.trim() : (t?.name || t?.label || `Table ${idx + 1}`)))
            : (numTables > 0 ? Array.from({ length: numTables }, (_, i) => `Table ${i + 1}`) : []);

          return {
            id: `${matchingVO.id}:${venueId}`,
            venueName: displayName,
            name: displayName,
            numberOfTables: tableList.length || numTables,
            address: specificVenue?.address || matchingVO.address || 'Venue Owner Location',
            facilities: specificVenue?.facilities || matchingVO.facilities || 'Provided by Venue Owner',
            openingHours: specificVenue?.openingHours || matchingVO.openingHours || 'Contact for hours',
            tables: tableList,
            slots: slots,
            isVenueOwnerVenue: true,
            createdAt: matchingVO.createdAt,
            createdBy: matchingVO.userId
          };
        }));

        venues.push(...venuesToAdd);
        console.log(`[getAvailableVenues] ✓ Added ${venuesToAdd.length} venues from VenueOwner ${matchingVO.id}`);
      }
    }

    // Deduplicate by id
    const uniqueVenues = [];
    const seenIds = new Set();
    for (const v of venues) {
      if (!seenIds.has(v.id)) {
        uniqueVenues.push(v);
        seenIds.add(v.id);
      }
    }
    venues = uniqueVenues;

    // If no venues matched from venueIds, return error (no fallback allowed)
    if (venues.length === 0) {
      console.log('[getAvailableVenues] WARNING: No venues matched from league venueIds list');
      return res.json({
        success: true,
        data: [],
        message: "Selected venues could not be found. Please contact league creator."
      });
    }

    console.log('[getAvailableVenues] Total venues after deduplication:', venues.length);
    console.log('[getAvailableVenues] Final response will have', venues.length, 'venues');

    return res.json({
      success: true,
      data: venues,
      message: "League venues retrieved successfully"
    });
  }

  // If tournamentId provided, return ONLY tournament-selected venue(s)
  if (req.query.tournamentId) {
    const { Tournament } = require("../models");
    const tournament = await Tournament.findByPk(req.query.tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const allowedIds = [];
    if (tournament.venueId) allowedIds.push(String(tournament.venueId));
    let venueIdsList = [];
    if (Array.isArray(tournament.venueIds)) {
      venueIdsList = tournament.venueIds;
    } else if (typeof tournament.venueIds === "string") {
      try { venueIdsList = JSON.parse(tournament.venueIds); } catch (_) { venueIdsList = []; }
    }
    for (const id of venueIdsList) {
      if (id != null) allowedIds.push(String(id));
    }

    // Fallback/source-of-truth for external venue flow:
    // accepted VenueRequest rows carry the approved venueOwner id even when
    // tournament.venueId / venueIds are empty.
    try {
      const acceptedVenueRequests = await VenueRequest.findAll({
        where: {
          tournamentId: tournament.id,
          status: "accepted",
        },
        attributes: ["venueId"],
      });
      for (const reqRow of acceptedVenueRequests) {
        if (reqRow?.venueId) allowedIds.push(String(reqRow.venueId));
      }
    } catch (e) {
      // Non-blocking; venue resolution will continue with tournament fields.
    }

    const uniqueAllowedIds = [...new Set(allowedIds.filter(Boolean))];
    const filteredVenues = [];

    for (const token of uniqueAllowedIds) {
      const entry = await buildTournamentVenueEntry(token, tournament);
      if (entry) filteredVenues.push(entry);
    }

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    return res.json({
      success: true,
      data: filteredVenues,
      message: "Tournament venues retrieved successfully",
    });
  }

  // If no leagueId or tournamentId, return empty array
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  return res.json({
    success: true,
    data: [],
    message: "No leagueId provided, no venues returned"
  });
}

// ============================================
// GET TABLES BY VENUE
// ============================================
exports.getTablesByVenue = async (req, res) => {
  try {
    const { venueId } = req.query;
    if (!venueId) {
      return res.status(400).json({ success: false, error: "venueId is required" });
    }

    const venue = await resolveVenueById(venueId);
    if (!venue) {
      return res.status(404).json({ success: false, error: "Venue not found" });
    }

    const normalizedTables = (Array.isArray(venue.tables) ? venue.tables : []).map((table, index) => {
      const name = typeof table === "string" ? table : (table?.name || table?.label || `Table ${index + 1}`);
      return {
        id: `${String(venueId)}::${name}`,
        name,
        tableNumber: index + 1,
        venueId: String(venueId),
      };
    });

    return res.json({
      success: true,
      data: normalizedTables,
      message: "Tables retrieved successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// GET SLOTS BY TABLE
// ============================================
exports.getSlotsByTable = async (req, res) => {
  try {
    const { tableId, date, tournamentId } = req.query;
    if (!tableId) {
      return res.status(400).json({ success: false, error: "tableId is required" });
    }

    const [rawVenueId, encodedTableName] = String(tableId).split("::");
    
    // Safer decoding: prevent crash on malformed URI sequences (e.g. stray % signs)
    const safeDecode = (str) => {
      try { return decodeURIComponent(str || ""); } catch (e) { return str || ""; }
    };
    
    // Decode twice to handle double-encoded client input, but safely
    const tableName = safeDecode(safeDecode(encodedTableName)).trim();

    if (!rawVenueId || !tableName) {
      return res.status(400).json({ success: false, error: "Invalid tableId" });
    }

    let venue = null;

    // Tournament-aware venue resolution: pin to the exact tournament venue entry,
    // not a merged VenueOwner-level slot set.
    if (tournamentId) {
      const tournament = await Tournament.findByPk(tournamentId);
      if (tournament) {
        let allowedIds = [];
        if (tournament.venueId) {
          allowedIds.push(String(tournament.venueId));
        }
        if (Array.isArray(tournament.venueIds)) {
          allowedIds.push(...tournament.venueIds.map(String));
        } else if (typeof tournament.venueIds === "string") {
          try {
            const parsed = JSON.parse(tournament.venueIds);
            if (Array.isArray(parsed)) {
              allowedIds.push(...parsed.map(String));
            }
          } catch (_) { }
        }

        const uniqueAllowedIds = [...new Set(allowedIds.filter(Boolean))];
        for (const token of uniqueAllowedIds) {
          const entry = await buildTournamentVenueEntry(token, tournament);
          if (!entry) continue;

          const entryId = String(entry.id || "").trim();
          const entrySourceId = String(entry.sourceVenueId || "").trim();
          const rawNorm = normalizeVenueToken(rawVenueId);
          const entryIdNorm = normalizeVenueToken(entryId);
          const entrySourceNorm = normalizeVenueToken(entrySourceId);
          if (
            entryId === rawVenueId ||
            entrySourceId === rawVenueId ||
            entryIdNorm === rawNorm ||
            entrySourceNorm === rawNorm
          ) {
            venue = {
              id: rawVenueId,
              venueName: entry.venueName || entry.name || "Venue",
              numberOfTables: Number(entry.numberOfTables) || 0,
              tables: Array.isArray(entry.tables) ? entry.tables : [],
              slots: Array.isArray(entry.slots) ? entry.slots : [],
            };
            break;
          }
        }
      }
    }

    if (!venue) {
      venue = await resolveVenueById(rawVenueId);
    }
    if (!venue) {
      return res.status(404).json({ success: false, error: "Venue not found" });
    }

    const allSlots = Array.isArray(venue.slots) ? venue.slots : [];
    const allTables = Array.isArray(venue.tables) ? venue.tables : [];

    // Determine fallback numeric mapping if table was saved without tableName
    let targetTableName = String(tableName).trim();
    let targetTableIdMatch = targetTableName;

    const strTableIndex = allTables.findIndex(t => typeof t === 'string' && t.trim() === targetTableName);
    if (strTableIndex !== -1) {
      const hasRealNames = allSlots.some(s => String(s.tableName || '').trim() === targetTableName);
      if (!hasRealNames) {
        const uniqueIds = [...new Set(allSlots.map(s => String(s.tableId || '')).filter(Boolean))];
        if (strTableIndex < uniqueIds.length) {
          targetTableIdMatch = uniqueIds[strTableIndex];
        }
      }
    }

    const slotTableKey = (slot) =>
      String(slot?.tableName ?? slot?.table ?? slot?.tableId ?? "").trim();

    let filtered = allSlots.filter((slot) => {
      const key = slotTableKey(slot);
      return key === targetTableName || key === targetTableIdMatch;
    });

    if (date) {
      const [y, m, d] = String(date).split("-").map(Number);
      const utcDate = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
      const dayName = normalizeWeekdayName(
        utcDate.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" })
      );
      filtered = filtered.filter((slot) => normalizeWeekdayName(slot.day) === dayName);
    }

    let existingForTable = [];
    if (date) {
      const venueClause = buildVenueClauseForActiveBookings(rawVenueId);
      existingForTable = await Booking.findAll({
        where: {
          bookingDate: date,
          status: { [Op.in]: ["pending", "confirmed"] },
          ...venueClause,
        },
        attributes: ["startTime", "endTime", "tableName", "tableNumber", "status", "bookingType", "tournamentId"],
        include: [{ association: "tournamentMatch", attributes: ["status"], required: false }],
      });
      existingForTable = existingForTable.filter(bookingBlocksAvailability);
      existingForTable = existingForTable.filter((b) =>
        tableNamesMatchForBooking(b.tableName, tableName)
      );
    }

    const normalized = filtered.map((slot) => {
      const st = normalizeTimeHHMM(slot.startTime);
      const et = normalizeTimeHHMM(slot.endTime);
      const booked =
        date &&
        existingForTable.some((b) =>
          rangesOverlap(st, et, normalizeTimeHHMM(b.startTime), normalizeTimeHHMM(b.endTime))
        );
      return {
        startTime: String(slot.startTime || ""),
        endTime: String(slot.endTime || ""),
        displayTime: `${slot.startTime} - ${slot.endTime}`,
        available: !booked,
        booked: !!booked,
      };
    });

    res.set({
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    return res.json({
      success: true,
      data: normalized,
      message: "Slots retrieved successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// GET AVAILABLE TIME SLOTS
// ============================================

/**
 * Get available time slots for a specific date and venue
 * Returns tables and their available time slots
 */
exports.getAvailableTimeSlots = async (req, res) => {
  try {
    const { venueId, date, tournamentId } = req.query;

    if (!venueId || !date) {
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      return res.status(400).json({
        success: false,
        error: "venueId and date are required"
      });
    }

    // Handle static venues (frontend hardcoded venues)
    let venue = null;
    let isClubVenue = false;
    let customSlots = [];
    let customTables = [];

    if (venueId === '1' || venueId === 1) {
      venue = { id: 1, venueName: 'Berrow', numberOfTables: 2 };
    } else if (venueId === '2' || venueId === 2) {
      venue = { id: 2, venueName: 'Highbridge', numberOfTables: 1 };
    } else if (typeof venueId === "string" && venueId.includes(":")) {
      // Handle composite venue ID format: ownerId:venueRef (works with or without tournamentId)
      const { VenueOwner, Club } = require("../models");
      const [ownerId, venueRef] = venueId.split(":");
      const venueOwner = await VenueOwner.findByPk(ownerId);
      if (venueOwner) {
        let matchedOwnerVenue = null;

        // First, try to find in VenueOwner.venues array
        const ownerVenues = parseVenueCollections(venueOwner.venues);
        matchedOwnerVenue = ownerVenues.find((v) => {
          const vid = String(v?.id || v?.venueId || "").trim();
          const vname = String(v?.name || v?.venueName || "").trim();
          return vid === String(venueRef).trim() || vname === String(venueRef).trim();
        });

        // If not found, search in Club.venues
        if (!matchedOwnerVenue) {
          const allClubs = await Club.findAll({ attributes: ["id", "venues"] });
          for (const club of allClubs) {
            const clubVenues = parseVenueCollections(club.venues);
            matchedOwnerVenue = clubVenues.find(v => {
              const vid = String(v?.id || v?.venueId || "").trim();
              return vid === String(venueRef).trim();
            });
            if (matchedOwnerVenue) break;
          }
        }

        try {
          if (matchedOwnerVenue) {
            venue = {
              id: venueId,
              venueName: matchedOwnerVenue.name || matchedOwnerVenue.venueName || venueOwner.venueName,
              numberOfTables: Array.isArray(matchedOwnerVenue.tables)
                ? matchedOwnerVenue.tables.length
                : (Number(venueOwner.numberOfTables) || 0),
            };
            customSlots = Array.isArray(matchedOwnerVenue.slots) ? matchedOwnerVenue.slots : [];
            customTables = Array.isArray(matchedOwnerVenue.tables) ? matchedOwnerVenue.tables : [];
          } else {
            // Composite ID found but no matching venue inside - return empty slots instead of 404
            res.set({
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            });
            return res.status(200).json({
              success: true,
              data: {
                venue: null,
                timeSlots: [],
                date: date
              }
            });
          }
        } catch (findError) {
          throw findError;
        }
      } else {
        // Composite ID invalid - VenueOwner not found - return empty slots instead of 404
        res.set({
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        return res.status(200).json({
          success: true,
          data: {
            venue: null,
            timeSlots: [],
            date: date
          }
        });
      }
    } else if (tournamentId) {
      // Tournament-aware venue resolution: prefer the selected venue details from tournament club config.
      const { Tournament, Club, VenueOwner } = require("../models");
      const tournament = await Tournament.findByPk(tournamentId);
      const club = tournament?.clubId ? await Club.findByPk(tournament.clubId) : null;
      let clubVenues = [];
      if (club?.venues) {
        try {
          clubVenues = typeof club.venues === 'string'
            ? JSON.parse(club.venues)
            : (Array.isArray(club.venues) ? club.venues : Object.values(club.venues || {}));
        } catch (_) {
          clubVenues = [];
        }
      }

      const normalizeId = (v) => String(v || '').replace(/^(venue_|virtual_)/, '').trim();
      const reqNorm = normalizeId(venueId);
      let tournamentVenueIds = [];
      if (Array.isArray(tournament?.venueIds)) {
        tournamentVenueIds = tournament.venueIds;
      } else if (typeof tournament?.venueIds === 'string') {
        try { tournamentVenueIds = JSON.parse(tournament.venueIds); } catch (_) { tournamentVenueIds = []; }
      }
      const allowedNorms = new Set(
        [
          ...(tournament?.venueId ? [tournament.venueId] : []),
          ...tournamentVenueIds,
        ]
          .filter(Boolean)
          .map(normalizeId)
      );

      let matchedVenue = clubVenues.find((v) => normalizeId(v?.id) === reqNorm);
      if (!matchedVenue) {
        matchedVenue = clubVenues.find((v) => allowedNorms.has(normalizeId(v?.id)));
      }
      if (!matchedVenue && clubVenues.length === 1) {
        matchedVenue = clubVenues[0];
      }

      if (matchedVenue) {
        venue = {
          id: matchedVenue.id,
          venueName: matchedVenue.name || matchedVenue.venueName,
          numberOfTables: Array.isArray(matchedVenue.tables) ? matchedVenue.tables.length : 0
        };
        isClubVenue = true;
        customSlots = Array.isArray(matchedVenue.slots) ? matchedVenue.slots : [];
        customTables = Array.isArray(matchedVenue.tables) ? matchedVenue.tables : [];
      }
      if (!venue) {
        // fallback to normal venue owner resolution below
        venue = await VenueOwner.findByPk(venueId);
      }
    } else if (venueId.startsWith('venue_') || venueId.startsWith('virtual_')) {
      // It's a club venue, search across all clubs
      const { Club } = require("../models");
      const allClubs = await Club.findAll();

      for (const club of allClubs) {
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

        // Remove 'venue_' or 'virtual_' prefix to match club venue
        const venueNameToMatch = venueId.replace(/^(venue_|virtual_)/, '');
        const matchedVenue = clubVenues.find(v => v.id === venueNameToMatch || v.name === venueNameToMatch || v.id === venueId || v.name === venueId);
        if (matchedVenue) {
          venue = {
            id: matchedVenue.id,
            venueName: matchedVenue.name,
            numberOfTables: Array.isArray(matchedVenue.tables) ? matchedVenue.tables.length : 0
          };
          isClubVenue = true;
          customSlots = Array.isArray(matchedVenue.slots) ? matchedVenue.slots : [];
          customTables = Array.isArray(matchedVenue.tables) ? matchedVenue.tables : [];
          break;
        }
      }

      if (!venue) {
        res.set({
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        return res.status(404).json({ success: false, error: "Venue not found in clubs" });
      }
    } else {
      // For other IDs, try to find in database
      const VenueOwner = require("../models").VenueOwner;
      venue = await VenueOwner.findByPk(venueId);
      if (!venue) {
        res.set({
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        return res.status(404).json({ success: false, error: "Venue not found" });
      }
    }

    // Define standard time slots fallback
    const standardTimeSlots = [
      { startTime: "17:00:00", endTime: "19:00:00", display: "17:00 - 19:00" },
      { startTime: "19:00:00", endTime: "21:00:00", display: "19:00 - 21:00" },
      { startTime: "21:00:00", endTime: "23:00:00", display: "21:00 - 23:00" }
    ];

    // Get all bookings for this venue and date
    const { Booking } = require("../models");
    const { Op } = require("sequelize");
    const bookingWhere = {
      bookingDate: date,
      status: {
        [Op.in]: ["pending", "confirmed"]
      }
    };

    // Determine if we should query by venueOwnerId or venueId
    const venueIdStr = String(venueId);
    if (
      venueIdStr.startsWith('venue_') ||
      venueIdStr.startsWith('virtual_') ||
      venueIdStr === '1' ||
      venueIdStr === '2' ||
      venueIdStr.includes(':')
    ) {
      bookingWhere.venueId = venueId;
    } else {
      bookingWhere.venueOwnerId = venueId;
    }

    const existingBookings = await Booking.findAll({
      where: bookingWhere,
      attributes: ["tableNumber", "startTime", "endTime", "tableName", "status", "bookingType", "tournamentId"],
      include: [{ association: "tournamentMatch", attributes: ["status"], required: false }],
    });
    const blockingBookings = existingBookings.filter(bookingBlocksAvailability);

    // Parse date as UTC to ensure consistent day-of-week calculation regardless of timezone
    const [year, month, day] = date.split('-');
    const utcDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
    const dayOfWeek = utcDate.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' }).toLowerCase();
    let timeSlots = [];

    if (customSlots.length > 0) {
      // Filter custom slots by the selected day of the week
      const daySlots = customSlots.filter(s => String(s.day || '').trim().toLowerCase() === dayOfWeek);

      timeSlots = daySlots.map((slot) => {
        // Find which table index this tableId corresponds to
        let tableNum = 1;
        let tableNameStr = `Table 1`;

        let tableIndex = customTables.findIndex(t => {
          if (typeof t === 'string') {
            return t === slot.tableName || String(t) === String(slot.tableId);
          }
          return t.id === slot.tableId || t.name === slot.tableName;
        });

        // Add dynamic fallback mapping if tableIndex is still -1 (numeric ID missing string mapping)
        if (tableIndex === -1 && typeof customTables[0] === 'string' && !slot.tableName) {
          const uniqueTableIds = [...new Set(customSlots.map(s => String(s.tableId || '')).filter(Boolean))];
          const fallbackIndex = uniqueTableIds.indexOf(String(slot.tableId || ''));
          if (fallbackIndex !== -1 && fallbackIndex < customTables.length) {
            tableIndex = fallbackIndex;
          }
        }

        if (tableIndex !== -1) {
          tableNum = tableIndex + 1;
          const t = customTables[tableIndex];
          tableNameStr = typeof t === 'string' ? t : (t.name || `Table ${tableNum}`);
        }

        const formattedStartTime = slot.startTime.length === 5 ? `${slot.startTime}:00` : slot.startTime;
        const formattedEndTime = slot.endTime.length === 5 ? `${slot.endTime}:00` : slot.endTime;

        // Check if this table+time is already booked
        const isBooked = blockingBookings.some((booking) => {
          // Standardize both to HH:mm:ss for comparison
          const bStart = booking.startTime.length === 5 ? `${booking.startTime}:00` : booking.startTime;
          const fStart = formattedStartTime.length === 5 ? `${formattedStartTime}:00` : formattedStartTime;

          return (
            (booking.tableNumber === tableNum || booking.tableName === tableNameStr) &&
            bStart === fStart
          );
        });

        const displayTime = `${slot.startTime} - ${slot.endTime}`;

        return {
          startTime: formattedStartTime,
          endTime: formattedEndTime,
          displayTime: displayTime,
          tables: [{
            tableNumber: tableNum,
            tableName: tableNameStr,
            status: isBooked ? "unavailable" : "available"
          }]
        };
      });

      // Group slots with the same time
      const groupedSlots = {};
      timeSlots.forEach(slot => {
        const key = `${slot.startTime}-${slot.endTime}`;
        if (!groupedSlots[key]) {
          groupedSlots[key] = {
            startTime: slot.startTime,
            endTime: slot.endTime,
            displayTime: slot.displayTime,
            tables: [...slot.tables]
          };
        } else {
          groupedSlots[key].tables.push(...slot.tables);
        }
      });
      timeSlots = Object.values(groupedSlots);

    } else {
      // Standard fallback
      const numberOfTables = venue.numberOfTables || 2; // Default to 2 if not set
      timeSlots = standardTimeSlots.map((slot) => {
        const tables = [];

        for (let tableNum = 1; tableNum <= numberOfTables; tableNum++) {
          const tableName = `Table ${tableNum}`;

          // Check if this table+time is already booked
          const isBooked = blockingBookings.some((booking) => {
            // Standardize format to HH:mm:ss for comparison
            const bStart = booking.startTime.length === 5 ? `${booking.startTime}:00` : booking.startTime;
            const sStart = slot.startTime.length === 5 ? `${slot.startTime}:00` : slot.startTime;

            return (
              booking.tableNumber === tableNum &&
              bStart === sStart
            );
          });

          tables.push({
            tableNumber: tableNum,
            tableName: tableName, // Just use "Table X"
            status: isBooked ? "unavailable" : "available"
          });
        }

        return {
          startTime: slot.startTime,
          endTime: slot.endTime,
          displayTime: slot.display,
          tables
        };
      });
    }

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.json({
      success: true,
      data: {
        venue: {
          // Always return the original venueId from the request, so composite IDs are preserved
          id: req.query.venueId,
          name: venue.venueName || venue.name || "Venue",
          numberOfTables: venue.numberOfTables || 0
        },
        date,
        timeSlots
      },
      message: "Available time slots retrieved successfully"
    });
  } catch (error) {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// CREATE BOOKING
// ============================================

/**
 * Create a new booking for a league match
 * Status starts as "pending" until opponent confirms
 */
exports.createBooking = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      fixtureId,
      leagueId,
      venueId,
      bookingDate,
      startTime,
      endTime,
      tableNumber,
      tableName: requestedTableName,
      notes
    } = req.body;

    // Validation
    if (!fixtureId || !leagueId || !venueId || !bookingDate || !startTime || !endTime || !tableNumber) {
      return res.status(400).json({
        success: false,
        error: "All required fields must be provided"
      });
    }

    // Find player profile IDs (Unify by email for dual-role users)
    const playerIds = await getAllPlayerIdsForUser(userId);

    if (!playerIds || playerIds.length === 0) {
      return res.status(404).json({ success: false, error: "No player profile found. Please ensure you have a player profile linked to your account." });
    }

    // Verify fixture exists and player is a participant
    const fixture = await Fixture.findOne({
      where: {
        id: fixtureId,
        leagueId,
        [Op.or]: [
          { player1Id: { [Op.in]: playerIds } },
          { player2Id: { [Op.in]: playerIds } }
        ]
      },
      include: [
        {
          association: "league",
          include: [
            {
              association: "season",
              attributes: ["startDate", "endDate"]
            }
          ]
        },
        {
          association: "player1",
          attributes: ["id", "name"]
        },
        {
          association: "player2",
          attributes: ["id", "name"]
        }
      ]
    });

    if (!fixture) {
      return res.status(404).json({
        success: false,
        error: "Fixture not found or you are not a participant"
      });
    }

    // Verify league is active
    if (fixture.league.status !== "active") {
      return res.status(400).json({
        success: false,
        error: "League is not active for bookings"
      });
    }

    // Determine which player ID matched and who the opponent is
    const matchedPlayerId = playerIds.find(id => id === fixture.player1Id || id === fixture.player2Id);
    const opponentId = fixture.player1Id === matchedPlayerId ? fixture.player2Id : fixture.player1Id;

    // Verify both players belong to the league (already verified through fixture)

    // Verify booking date is within league actual date range (not registration dates)
    const bookingDateObj = new Date(bookingDate);
    const leagueStart = new Date(fixture.league.leagueStartDate || fixture.league.season?.startDate);
    const leagueEnd = new Date(fixture.league.leagueEndDate || fixture.league.season?.endDate);

    if (bookingDateObj < leagueStart || bookingDateObj > leagueEnd) {
      return res.status(400).json({
        success: false,
        error: `Booking date must be between ${leagueStart.toISOString().split('T')[0]} and ${leagueEnd.toISOString().split('T')[0]}`
      });
    }

    // CRITICAL FIX: Validate that the selected venue is in the league's approved venues list
    // BUT: If league has a venueOwnerId (organizer's own venue), allow booking with that venue ID
    const leagueVenues = await League.findByPk(leagueId, {
      attributes: ['venueIds', 'venueOwnerId']
    });

    if (!leagueVenues) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    // Parse league's approved venues
    let approvedVenueIds = [];
    if (leagueVenues.venueIds) {
      try {
        let parsed = leagueVenues.venueIds;
        while (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        if (Array.isArray(parsed)) {
          approvedVenueIds = parsed.map(v => String(v).toLowerCase().trim());
        }
      } catch (e) {
        console.error('[createBooking] Error parsing league venueIds:', e.message);
      }
    }

    // If league has a venueOwnerId (organizer's own venue), add it to approved venues
    if (leagueVenues.venueOwnerId) {
      approvedVenueIds.push(String(leagueVenues.venueOwnerId).toLowerCase().trim());
    }

    // Reject if no approved venues for this league (and no venueOwnerId either)
    if (approvedVenueIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "This league has no approved venues. Please contact the league creator."
      });
    }

    // Check if selected venue is in the approved list (case-insensitive)
    const venueIdNorm = String(venueId).toLowerCase().trim();

    // Extract owner ID from composite format if present (format: ownerId:venueRef)
    let venueOwnerIdFromComposite = null;
    if (venueIdNorm.includes(':')) {
      venueOwnerIdFromComposite = venueIdNorm.split(':')[0];
    }

    const isVenueApproved = approvedVenueIds.some(vid => {
      // Handle venueOwnerId:venueName format
      if (venueIdNorm.includes(':') && vid.includes(':')) {
        return venueIdNorm === vid;
      }
      // If client sent composite ID, extract and compare the owner ID part
      if (venueOwnerIdFromComposite) {
        return venueOwnerIdFromComposite === vid;
      }
      // Direct match
      return venueIdNorm === vid;
    });

    if (!isVenueApproved) {
      return res.status(400).json({
        success: false,
        error: `Venue is not approved for this league. Approved venues: ${approvedVenueIds.join(', ')}`
      });
    }

    // Verify venue exists and get details
    let venue;
    let actualVenueId = null;

    // NO STATIC VENUES ALLOWED - Removed support for hardcoded Berrow (1) and Highbridge (2)
    if (typeof venueId === 'string' && (venueId.startsWith('venue_') || venueId.startsWith('virtual_'))) {
      // It's a club venue, search across all clubs
      const { Club } = require("../models");
      const allClubs = await Club.findAll();

      for (const club of allClubs) {
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

        // Remove 'venue_' or 'virtual_' prefix to match club venue
        const venueNameToMatch = venueId.replace(/^(venue_|virtual_)/, '');
        const matchedVenue = clubVenues.find(v => v.id === venueNameToMatch || v.name === venueNameToMatch || v.id === venueId || v.name === venueId);
        if (matchedVenue) {
          venue = {
            id: matchedVenue.id,
            venueName: matchedVenue.name,
            numberOfTables: Array.isArray(matchedVenue.tables) ? matchedVenue.tables.length : 0
          };
          actualVenueId = null;
          break;
        }
      }

      if (!venue) {
        return res.status(404).json({ success: false, error: "Venue not found in clubs" });
      }
    } else if (venueId.includes(':')) {
      // It's a venueOwnerId:venueName format
      const [venueOwnerId, venueName] = venueId.split(':');
      console.log('[createBooking] Composite venue ID - owner:', venueOwnerId, 'venue name:', venueName);

      venue = await VenueOwner.findByPk(venueOwnerId);
      if (!venue) {
        return res.status(404).json({ success: false, error: "Venue owner not found" });
      }

      console.log('[createBooking] Venue owner found:', { id: venue.id, venueName: venue.venueName, hasVenues: !!venue.venues });

      // Try to find the venue in venueOwner.venues for additional details
      let matchedVenue = null;

      if (venue.venues) {
        let voVenues = [];
        try {
          let parsed = venue.venues;
          if (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
            // Handle double-encoded JSON
            if (typeof parsed === 'string') {
              parsed = JSON.parse(parsed);
            }
          }
          if (Array.isArray(parsed)) {
            voVenues = parsed;
          } else if (typeof parsed === 'object' && parsed !== null) {
            voVenues = Object.values(parsed);
          }
        } catch (e) {
          console.error('[createBooking] Error parsing venue.venues:', e.message);
          voVenues = [];
        }

        // Ensure voVenues is always an array before calling methods on it
        if (!Array.isArray(voVenues)) {
          voVenues = [];
        }

        console.log('[createBooking] VenueOwner venues array:', voVenues.length, 'venues. Looking for:', venueName);

        // Try exact match first (id or name match)
        matchedVenue = voVenues.find(v => v && (v.id === venueName || v.name === venueName));

        // If no exact match, try case-insensitive match
        if (!matchedVenue) {
          const venueNameLower = String(venueName).toLowerCase();
          matchedVenue = voVenues.find(v => v && (
            (v.id && String(v.id).toLowerCase() === venueNameLower) ||
            (v.name && String(v.name).toLowerCase() === venueNameLower)
          ));
        }

        // If still no match, try substring match (for dynamically generated venue IDs)
        if (!matchedVenue && voVenues.length > 0) {
          console.log('[createBooking] No exact match found, trying substring match');
          matchedVenue = voVenues.find(v => v && (
            (v.id && v.id.includes(venueName)) ||
            (v.name && v.name.includes(venueName)) ||
            venueName.includes(v.id || '') ||
            venueName.includes(v.name || '')
          ));
        }

        // If still no match, and there's only one venue, use it
        if (!matchedVenue && voVenues.length === 1) {
          console.log('[createBooking] Using the only available venue');
          matchedVenue = voVenues[0];
        }

        if (matchedVenue) {
          console.log('[createBooking] Matched venue from array:', matchedVenue);
        } else {
          console.warn('[createBooking] Venue not found in venues array. venueName:', venueName, 'Available venues:', voVenues.map(v => ({ id: v?.id, name: v?.name })));
        }
      } else {
        console.warn('[createBooking] Venue owner has no venues array configured');
      }

      // Create venue object - use matched venue details if found, otherwise use defaults
      // This is safe because we've already validated the venue at the league level
      venue = {
        id: venueId, // full string
        venueName: matchedVenue?.name || matchedVenue?.id || venueName || venue.venueName || 'Booking Venue',
        numberOfTables: matchedVenue ?
          (Array.isArray(matchedVenue.tables) ? matchedVenue.tables.length : (matchedVenue.numberOfTables || 10)) :
          10 // default to 10 tables if no matched venue
      };

      console.log('[createBooking] Final venue object:', venue);
      actualVenueId = venueId; // full string
    } else {
      // For other IDs, try to find in database
      venue = await VenueOwner.findByPk(venueId);
      if (!venue) {
        return res.status(404).json({ success: false, error: "Venue not found" });
      }
      actualVenueId = venue.id;
    }

    // Verify table number is valid
    if (tableNumber < 1 || tableNumber > (venue.numberOfTables || 10)) {
      return res.status(400).json({
        success: false,
        error: `Invalid table number. Venue has ${venue.numberOfTables || 10} tables`
      });
    }

    const venueOrLeague = [];
    if (venueId.includes(":")) {
      venueOrLeague.push({ venueId: venueId });
      venueOrLeague.push({ venueOwnerId: venueId.split(":")[0] });
    } else if (venueId.startsWith("venue_") || venueId.startsWith("virtual_")) {
      venueOrLeague.push({ venueId: venueId });
    } else {
      venueOrLeague.push({ venueOwnerId: venueId });
      if (UUID_RE.test(String(venueId))) venueOrLeague.push({ venueId: String(venueId) });
    }

    const conflictingBookingsLeague = await Booking.findAll({
      where: {
        bookingDate,
        status: { [Op.in]: ["pending", "confirmed"] },
        [Op.or]: venueOrLeague,
      },
      attributes: ["startTime", "endTime", "tableName", "tableNumber", "venueId", "venueOwnerId"],
    });
    const leagueTableLabel = `Table ${tableNumber}`;
    const conflictingBooking = conflictingBookingsLeague.find((b) => {
      // Check if table numbers match explicitly (most reliable check)
      const tableNumberMatch = Number(b.tableNumber) === Number(tableNumber);
      // Also check if table names match (fallback for different formats)
      const tableNameMatch = tableNamesMatchForBooking(b.tableName, leagueTableLabel);
      // At least one table identifier must match
      if (!tableNumberMatch && !tableNameMatch) return false;

      // Check if time ranges overlap
      return rangesOverlap(
        normalizeTimeHHMM(b.startTime),
        normalizeTimeHHMM(b.endTime),
        normalizeTimeHHMM(startTime),
        normalizeTimeHHMM(endTime)
      );
    });

    if (conflictingBooking) {
      return res.status(409).json({
        success: false,
        error: "This table and time slot is already booked for that date. Please select a different table or time.",
      });
    }

    // Check if there's already a booking for this fixture
    const existingFixtureBooking = await Booking.findOne({
      where: {
        fixtureId,
        status: {
          [Op.in]: ["pending", "confirmed"]
        }
      }
    });

    if (existingFixtureBooking) {
      return res.status(409).json({
        success: false,
        error: "A booking already exists for this match"
      });
    }

    // Create the booking
    let bookingVenueId = null;
    let bookingVenueOwnerId = null;

    if (venueId === '1' || venueId === '2') {
      bookingVenueId = venueId;
    } else if (venueId.includes(':')) {
      bookingVenueId = venueId;
      bookingVenueOwnerId = venueId.split(':')[0];
    } else if (venueId.startsWith('venue_') || venueId.startsWith('virtual_')) {
      bookingVenueId = venueId;
    } else {
      bookingVenueOwnerId = venueId;
    }

    let sportNorm = String(fixture.league.sport || "snooker").toLowerCase();
    if (sportNorm === "poker") sportNorm = "pooker";
    if (!["snooker", "pool", "pooker"].includes(sportNorm)) {
      sportNorm = "snooker";
    }

    const bookingData = {
      fixtureId,
      leagueId,
      bookingType: "league",
      playerId: matchedPlayerId,
      opponentId,
      venueId: bookingVenueId,
      venueOwnerId: bookingVenueOwnerId,
      bookingDate,
      startTime,
      endTime,
      tableNumber,
      tableName: requestedTableName || `Table ${tableNumber}`,
      status: "pending",
      notes,
      sport: sportNorm
    };

    const booking = await Booking.create(bookingData);

    // Fetch complete booking with associations
    const completeBooking = await Booking.findByPk(booking.id, {
      include: [
        {
          association: "player",
          attributes: ["id", "name", "nickname", "userId"],
          include: [{ association: "user", attributes: ["id", "email"] }]
        },
        {
          association: "opponent",
          attributes: ["id", "name", "nickname", "userId"],
          include: [{ association: "user", attributes: ["id", "email"] }]
        },
        {
          association: "venue",
          attributes: ["id", "venueName", "address"],
          required: false
        },
        {
          association: "league",
          attributes: ["id", "name", "sport"]
        },
        {
          association: "fixture",
          attributes: ["id", "round", "matchNumber"]
        }
      ]
    });

    // Add static venue data if using hardcoded venues
    const completeBookingData = completeBooking.toJSON();
    if (completeBooking.venueId) {
      // Use venueId field for static venues
      completeBookingData.venue = completeBooking.venueId === 1 ?
        { id: 1, venueName: 'Berrow', address: 'Berrow Recreation Club, Berrow Road' } :
        { id: 2, venueName: 'Highbridge', address: 'Highbridge Community Centre, Church Street' };
    }

    // Send email notification to opponent
    try {
      const opponentUser = completeBooking.opponent.user;

      if (opponentUser && opponentUser.email) {
        const timeSlot = `${completeBooking.startTime} - ${completeBooking.endTime}`;
        const venueName = completeBookingData.venue?.venueName || 'TBD';

        await sendBookingCreatedEmail({
          opponentEmail: opponentUser.email,
          opponentName: completeBooking.opponent.nickname || completeBooking.opponent.name,
          creatorName: completeBooking.player.nickname || completeBooking.player.name,
          matchDetails: { sport: fixture.league.sport },
          leagueName: fixture.league.name,
          fixtureRound: fixture.round,
          bookingDate: completeBooking.bookingDate,
          venueName: venueName,
          timeSlot: timeSlot
        });
      }
    } catch (emailError) {
      // Don't fail the booking creation if email fails
    }

    res.status(201).json({
      success: true,
      data: completeBookingData,
      message: "Booking created successfully. Waiting for opponent confirmation."
    });
  } catch (error) {
    console.error('[createBooking] Error:', error.message || error);
    console.error('[createBooking] Stack:', error.stack);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * POST /api/bookings/tournament
 * Player proposes a table booking for a tournament bracket match (pending until opponent confirms).
 */
exports.createTournamentBooking = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      tournamentMatchId,
      tournamentId,
      venueId,
      bookingDate,
      startTime,
      endTime,
      tableNumber,
      tableName,
      sport,
      notes,
    } = req.body || {};

    if (!tournamentMatchId || !tournamentId || !venueId || !bookingDate || !startTime || !endTime || tableNumber == null) {
      return res.status(400).json({
        success: false,
        error: "All required fields must be provided",
      });
    }

    const playerIds = await getAllPlayerIdsForUser(userId);
    if (!playerIds || playerIds.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No player profile found. Please ensure you have a player profile linked to your account.",
      });
    }

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament || !tournamentRowIsVisibleForPlayerBookings(tournament)) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const match = await TournamentMatch.findOne({
      where: { id: tournamentMatchId, tournamentId },
      include: [
        { association: "player1", attributes: ["id", "name", "nickname"] },
        { association: "player2", attributes: ["id", "name", "nickname"] },
      ],
    });

    if (!match) {
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    if (["completed", "voided", "walkover"].includes(String(match.status || ""))) {
      return res.status(400).json({ success: false, error: "This match can no longer be booked" });
    }

    if (!match.player1Id || !match.player2Id) {
      return res.status(400).json({ success: false, error: "Match is not ready for booking (opponent TBD)" });
    }

    const matchedPlayerId = playerIds.find((id) => id === match.player1Id || id === match.player2Id);
    if (!matchedPlayerId) {
      return res.status(403).json({
        success: false,
        error: "You are not a participant in this match",
      });
    }
    const opponentId = match.player1Id === matchedPlayerId ? match.player2Id : match.player1Id;

    const parseYmdBoundary = (value, endOfDay) => {
      // If value is already a Date object, use it directly
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const dt = new Date(value);
        dt.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return dt;
      }

      // Otherwise, try to parse as ISO string or YMD format
      const raw = String(value || "").trim();
      const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return null;
      const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (Number.isNaN(dt.getTime())) return null;
      if (endOfDay) dt.setHours(23, 59, 59, 999);
      else dt.setHours(0, 0, 0, 0);
      return dt;
    };

    const bd = parseYmdBoundary(bookingDate, false);
    const t0 = parseYmdBoundary(tournament.startDate, false);
    const t1 = parseYmdBoundary(tournament.endDate, true);
    if (!bd || !t0 || !t1 || bd < t0 || bd > t1) {
      return res.status(400).json({
        success: false,
        error: "Booking date must fall within the tournament dates",
      });
    }

    const venueResolved = await resolveVenueById(venueId);
    if (!venueResolved) {
      return res.status(404).json({ success: false, error: "Venue not found" });
    }

    const nTables = Math.max(Number(venueResolved.numberOfTables) || 0, 1);
    if (tableNumber < 1 || tableNumber > nTables) {
      return res.status(400).json({
        success: false,
        error: `Invalid table number. Venue has ${nTables} table(s)`,
      });
    }

    const venueOrLeague = [];
    if (venueId === "1" || venueId === "2") {
      venueOrLeague.push({ venueId: String(venueId) });
    } else if (String(venueId).includes(":")) {
      venueOrLeague.push({ venueId: String(venueId) });
      venueOrLeague.push({ venueOwnerId: String(venueId).split(":")[0] });
    } else if (String(venueId).startsWith("venue_") || String(venueId).startsWith("virtual_")) {
      venueOrLeague.push({ venueId: String(venueId) });
    } else {
      venueOrLeague.push({ venueOwnerId: String(venueId) });
      if (UUID_RE.test(String(venueId))) venueOrLeague.push({ venueId: String(venueId) });
    }

    const conflictingBookings = await Booking.findAll({
      where: {
        bookingDate,
        status: { [Op.in]: ["pending", "confirmed"] },
        [Op.or]: venueOrLeague,
      },
      attributes: ["startTime", "endTime", "tableName", "tableNumber", "venueId", "venueOwnerId", "status", "bookingType", "tournamentId"],
      include: [{ association: "tournamentMatch", attributes: ["status"], required: false }],
    });

    const blockingBookings = conflictingBookings.filter(bookingBlocksAvailability);

    const effectiveTableLabel = normalizeTableLabel(tableName) || `Table ${tableNumber}`;
    const conflictingBooking = blockingBookings.find((b) => {
      // Check if table numbers match explicitly (most reliable check)
      const tableNumberMatch = Number(b.tableNumber) === Number(tableNumber);
      // Also check if table names match (fallback for different formats)
      const tableNameMatch = tableNamesMatchForBooking(b.tableName, effectiveTableLabel);
      // At least one table identifier must match
      if (!tableNumberMatch && !tableNameMatch) return false;

      // Check if time ranges overlap
      return rangesOverlap(
        normalizeTimeHHMM(b.startTime),
        normalizeTimeHHMM(b.endTime),
        normalizeTimeHHMM(startTime),
        normalizeTimeHHMM(endTime)
      );
    });

    if (conflictingBooking) {
      return res.status(409).json({
        success: false,
        error: "This table and time slot is already booked for that date. Please select a different table or time.",
      });
    }

    const existingMatchBooking = await Booking.findOne({
      where: {
        tournamentMatchId,
        status: { [Op.in]: ["pending", "confirmed"] },
      },
    });

    if (existingMatchBooking) {
      return res.status(409).json({
        success: false,
        error: "A booking already exists for this match",
      });
    }

    let bookingVenueId = null;
    let bookingVenueOwnerId = null;
    if (venueId === "1" || venueId === "2") {
      bookingVenueId = String(venueId);
    } else if (String(venueId).includes(":")) {
      bookingVenueId = String(venueId);
      bookingVenueOwnerId = String(venueId).split(":")[0];
    } else if (String(venueId).startsWith("venue_") || String(venueId).startsWith("virtual_")) {
      bookingVenueId = String(venueId);
    } else {
      bookingVenueOwnerId = String(venueId);
      if (UUID_RE.test(String(venueId))) {
        bookingVenueId = String(venueId);
      }
    }

    let sportNorm = String(sport || tournament.sport || "snooker").toLowerCase();
    if (sportNorm === "poker") sportNorm = "pooker";
    if (!["snooker", "pool", "pooker"].includes(sportNorm)) {
      sportNorm = "snooker";
    }

    const booking = await Booking.create({
      fixtureId: null,
      leagueId: null,
      tournamentId,
      tournamentMatchId,
      bookingType: "tournament",
      playerId: matchedPlayerId,
      opponentId,
      venueId: bookingVenueId,
      venueOwnerId: bookingVenueOwnerId,
      bookingDate,
      startTime,
      endTime,
      tableNumber,
      tableName: effectiveTableLabel,
      status: "pending",
      notes: notes || null,
      sport: sportNorm,
    });

    const completeBooking = await Booking.findByPk(booking.id, {
      include: [
        {
          association: "player",
          attributes: ["id", "name", "nickname", "userId"],
          include: [{ association: "user", attributes: ["id", "email"] }],
        },
        {
          association: "opponent",
          attributes: ["id", "name", "nickname", "userId"],
          include: [{ association: "user", attributes: ["id", "email"] }],
        },
        {
          association: "tournamentMatch",
          attributes: ["id", "roundNumber", "roundType", "matchNumber", "status"],
        },
      ],
    });

    try {
      const opponentUser = completeBooking.opponent?.user;
      if (opponentUser && opponentUser.email) {
        const roundLabel =
          completeBooking.tournamentMatch?.roundType &&
            completeBooking.tournamentMatch?.roundNumber != null
            ? `Round ${completeBooking.tournamentMatch.roundNumber} (${String(completeBooking.tournamentMatch.roundType).replace(/_/g, " ")})`
            : "Tournament match";
        await sendTournamentBookingCreatedEmail({
          opponentEmail: opponentUser.email,
          opponentName: completeBooking.opponent.nickname || completeBooking.opponent.name,
          creatorName: completeBooking.player.nickname || completeBooking.player.name,
          matchDetails: { sport: sportNorm },
          tournamentName: tournament.name || "Tournament",
          roundLabel,
          bookingDate,
          venueName: venueResolved.venueName || "Venue",
          timeSlot: `${normalizeTimeHHMM(startTime)} - ${normalizeTimeHHMM(endTime)}`,
        });
      }
    } catch (emailErr) {
      console.warn("[createTournamentBooking] email:", emailErr?.message || emailErr);
    }

    return res.status(201).json({
      success: true,
      data: completeBooking.toJSON(),
      message: "Booking created successfully. Waiting for opponent confirmation.",
    });
  } catch (error) {
    console.error("createTournamentBooking error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// GET MY BOOKINGS
// ============================================

/**
 * Get all bookings for the logged-in player
 * Includes both created and received bookings
 */
exports.getMyBookings = async (req, res) => {
  try {
    const { userId } = req.user;
    const { status } = req.query; // Optional filter by status

    // Ensure UI always receives latest booking rows (no conditional 304 / caching).
    res.set({
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    // Express may still attach an ETag header depending on middleware; remove it explicitly.
    res.removeHeader?.("ETag");

    // Get or create the player profile
    const player = await getOrCreatePlayerProfile(userId);

    if (!player) {
      return res.status(404).json({ success: false, error: "No player profile found. Please ensure you have a player profile linked to your account." });
    }

    const playerIds = await getAllPlayerIdsForUser(userId);

    const whereClause = {
      [Op.or]: [
        { playerId: { [Op.in]: playerIds } },
        { opponentId: { [Op.in]: playerIds } }
      ]
    };

    // Default behavior: show only active/finished bookings.
    // (Cancelled/rejected bookings should not clutter "My Bookings" UI.)
    whereClause.status = status
      ? status
      : { [Op.in]: ["pending", "confirmed", "completed"] };

    const bookings = filterBookingsForPlayerList(
      await Booking.findAll({
        where: whereClause,
        include: [
          {
            association: "player",
            attributes: ["id", "name", "nickname"]
          },
          {
            association: "opponent",
            attributes: ["id", "name", "nickname"]
          },
          {
            association: "venue",
            attributes: ["id", "venueName", "address", "openingHours"],
            required: false
          },
          {
            association: "league",
            attributes: ["id", "name", "sport", "format"],
            required: false
          },
          {
            association: "fixture",
            attributes: ["id", "round", "matchNumber", "status"],
            required: false
          },
          {
            association: "tournament",
            attributes: ["id", "name", "sport", "status", "isArchived"],
            required: false
          },
          {
            association: "tournamentMatch",
            attributes: ["id", "roundNumber", "roundType", "matchNumber", "status"],
            required: false
          }
        ],
        order: [["bookingDate", "ASC"], ["startTime", "ASC"]]
      })
    );

    // Fetch all clubs once to handle club venues
    const clubs = await Club.findAll();

    const ownerIdsToFetch = [...new Set(
      bookings
        .filter(b => typeof b.venueId === 'string' && b.venueId.includes(':'))
        .map(b => b.venueId.split(':')[0])
    )];

    let venueOwners = [];
    if (ownerIdsToFetch.length > 0) {
      venueOwners = await VenueOwner.findAll({
        where: { id: ownerIdsToFetch },
        attributes: ['id', 'venueName', 'name', 'venues', 'address', 'openingHours', 'phoneNumber']
      });
    }

    const ownerMap = new Map(venueOwners.map(vo => [vo.id, vo]));

    // Add metadata about who needs to act
    const formattedBookings = bookings.map((booking) => {
      const isCreator = playerIds.includes(booking.playerId);
      const needsAction = !isCreator && booking.status === "pending";

      // Determine the "other player" (the one who is not the current user)
      const otherPlayer = isCreator ? booking.opponent : booking.player;

      const bookingData = booking.toJSON();

      // Normalize sport for UI categorization
      let actualSport = booking.sport;
      const contextSport = (booking.league && booking.league.sport) || (booking.tournament && booking.tournament.sport);
      if (contextSport) {
        const normContext = contextSport.toLowerCase();
        if (normContext === 'poker' || normContext === 'pooker') {
          actualSport = 'pooker';
        } else if (normContext === 'pool') {
          actualSport = 'pool';
        } else {
          actualSport = 'snooker';
        }
      }
      bookingData.sport = actualSport;

      // Fix venue mapping for both static and virtual club venues
      if (booking.venueId) {
        if (booking.venueId === 1 || booking.venueId === "1" || booking.venueId === 1771927027787) {
          bookingData.venue = { id: 1, venueName: 'Berrow', address: 'Berrow Recreation Club, Berrow Road', openingHours: 'Mon-Fri: 5PM-11PM, Sat-Sun: 2PM-11PM' };
        } else if (booking.venueId === 2 || booking.venueId === "2") {
          bookingData.venue = { id: 2, venueName: 'Highbridge', address: 'Highbridge Community Centre, Church Street', openingHours: 'Mon-Fri: 6PM-10PM, Sat-Sun: 2PM-10PM' };
        } else if (typeof booking.venueId === 'string' && booking.venueId.includes(':')) {
          // Handle composite venueOwnerId:venueRef format - look up the actual venue owner
          const colonIdx = booking.venueId.indexOf(':');
          const venueOwnerId = booking.venueId.slice(0, colonIdx);
          const venueRef = booking.venueId.slice(colonIdx + 1).trim();
          const normRef = normalizeVenueToken(venueRef).toLowerCase();

          const venueOwner = ownerMap.get(venueOwnerId);

          if (venueOwner) {
            // 1. Search the owner's sub-venues array for the specific venue that was booked
            const ownerVenues = parseVenueCollections(venueOwner.venues);
            let matchedSubVenue = ownerVenues.find((v) => {
              const vid = normalizeVenueToken(v?.id || v?.venueId || '').toLowerCase();
              const vname = normalizeVenueToken(v?.name || v?.venueName || '').toLowerCase();
              return vid === normRef || vname === normRef;
            });

            // 2. If not found in owner's sub-venues, search in all Clubs
            if (!matchedSubVenue && clubs && clubs.length > 0) {
              for (const club of clubs) {
                const clubVenues = parseVenueCollections(club.venues);
                matchedSubVenue = clubVenues.find((v) => {
                  const vid = normalizeVenueToken(v?.id || v?.venueId || '').toLowerCase();
                  const vname = normalizeVenueToken(v?.name || v?.venueName || '').toLowerCase();
                  return vid === normRef || vname === normRef;
                });
                if (matchedSubVenue) break;
              }
            }

            // Use sub-venue name if found, otherwise fall back to the owner's top-level name
            const resolvedVenueName = matchedSubVenue?.name
              || matchedSubVenue?.venueName
              || venueOwner.venueName
              || venueOwner.name
              || venueRef; // Last resort: the ID part from the booking itself

            bookingData.venue = {
              id: booking.venueId,
              venueName: resolvedVenueName,
              address: matchedSubVenue?.address || venueOwner.address || '',
              openingHours: matchedSubVenue?.openingHours || venueOwner.openingHours || '',
              phone: venueOwner.phoneNumber || ''
            };
          } else {
            // Fallback to the name portion from the composite ID if owner not found
            bookingData.venue = {
              id: booking.venueId,
              venueName: venueRef || 'Venue',
              address: '',
              openingHours: ''
            };
          }
        } else if (typeof booking.venueId === 'string' && (booking.venueId.startsWith('venue_') || booking.venueId.startsWith('virtual_'))) {
          // Look up in clubs using robust matching
          const reqNorm = normalizeVenueToken(booking.venueId).toLowerCase();
          for (const club of clubs) {
            const clubVenues = parseVenueCollections(club.venues);
            const v = clubVenues.find(cv => {
              const vid = normalizeVenueToken(cv.id || cv.venueId || '').toLowerCase();
              const vname = normalizeVenueToken(cv.name || cv.venueName || '').toLowerCase();
              return vid === reqNorm || vname === reqNorm;
            });

            if (v) {
              bookingData.venue = {
                id: v.id,
                venueName: v.name || v.venueName || club.name,
                address: v.address || club.address,
                openingHours: v.openingHours || club.openingHours
              };
              break;
            }
          }
        }
      }

      return {
        ...bookingData,
        isCreator,
        needsAction,
        displayOpponent: otherPlayer,
        opponentName: otherPlayer?.nickname || otherPlayer?.name || "Unknown",
        actionLabel: needsAction ? "Confirm Booking" : null,
        // Unified title for both league and tournament bookings
        contextName:
          bookingData.tournament?.name ||
          bookingData.league?.name ||
          null,
        bookingType: bookingData.bookingType || (bookingData.leagueId ? "league" : "tournament"),
        venueName: bookingData.venue?.venueName || booking.venue?.venueName || booking.venueId || 'Unknown Venue',
      };
    });

    res.json({
      success: true,
      data: formattedBookings,
      message: "Bookings retrieved successfully"
    });
  } catch (error) {
    console.error("[getMyBookings] Critical error:", error);
    res.status(500).json({ success: false, error: "Internal server error", details: error.message, stack: error.stack });
  }
};

// ============================================
// GET COMPLETED BOOKINGS
// ============================================

/**
 * Get all completed bookings for the logged-in player
 */
exports.getCompletedBookings = async (req, res) => {
  try {
    const { userId } = req.user;

    res.set({
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    res.removeHeader?.("ETag");

    // Get or create the player profile
    const player = await getOrCreatePlayerProfile(userId);

    if (!player) {
      return res.status(404).json({ success: false, error: "No player profile found. Please ensure you have a player profile linked to your account." });
    }

    const whereClause = {
      status: "completed",
      [Op.or]: [
        { playerId: player.id },
        { opponentId: player.id }
      ]
    };

    const bookings = filterBookingsForPlayerList(
      await Booking.findAll({
        where: whereClause,
        include: [
          {
            association: "player",
            attributes: ["id", "name", "nickname"]
          },
          {
            association: "opponent",
            attributes: ["id", "name", "nickname"]
          },
          {
            association: "venue",
            attributes: ["id", "venueName", "address", "openingHours"],
            required: false
          },
          {
            association: "league",
            attributes: ["id", "name", "sport", "format"],
            required: false
          },
          {
            association: "fixture",
            attributes: ["id", "round", "matchNumber", "status"],
            required: false
          },
          {
            association: "tournament",
            attributes: ["id", "name", "sport", "status", "isArchived"],
            required: false
          },
          {
            association: "tournamentMatch",
            attributes: ["id", "roundNumber", "roundType", "matchNumber", "status"],
            required: false
          }
        ],
        order: [["bookingDate", "DESC"], ["startTime", "DESC"]]
      })
    );

    // Fetch all clubs once to handle club venues
    const clubs = await Club.findAll();

    // Add metadata about completion
    const formattedBookings = bookings.map((booking) => {
      const isCreator = booking.playerId === player.id;

      // Determine the "other player" (the one who is not the current user)
      const otherPlayer = isCreator ? booking.opponent : booking.player;

      const bookingData = booking.toJSON();

      // Fix venue mapping for both static and virtual club venues
      if (booking.venueId) {
        if (booking.venueId === 1 || booking.venueId === "1" || booking.venueId === 1771927027787) {
          bookingData.venue = { id: 1, venueName: 'Berrow', address: 'Berrow Recreation Club, Berrow Road', openingHours: 'Mon-Fri: 5PM-11PM, Sat-Sun: 2PM-11PM' };
        } else if (booking.venueId === 2 || booking.venueId === "2") {
          bookingData.venue = { id: 2, venueName: 'Highbridge', address: 'Highbridge Community Centre, Church Street', openingHours: 'Mon-Fri: 6PM-10PM, Sat-Sun: 2PM-10PM' };
        } else if (typeof booking.venueId === 'string' && booking.venueId.includes(':')) {
          const colonIdx = booking.venueId.indexOf(':');
          const venueOwnerId = booking.venueId.slice(0, colonIdx);
          const venueRef = booking.venueId.slice(colonIdx + 1).trim();
          const normRef = normalizeVenueToken(venueRef).toLowerCase();

          // Note: In getCompletedBookings, this is a sync loop over bookings.
          // Since we can't await inside this map (it's not Promise.all here),
          // we fallback to the venueRef or info already joined.
          // However, we should try to make it async like getMyBookings if needed.
          // For now, we'll use the ID part as the name fallback if matching fails.

          const venueRefName = venueRef.replace(/^(venue_|virtual_)/, '').replace(/_/g, ' ');
          bookingData.venue = {
            id: booking.venueId,
            venueName: venueRefName || 'Venue'
          };
        } else if (typeof booking.venueId === 'string' && booking.venueId.startsWith('venue_')) {
          // Look up in clubs
          for (const club of clubs) {
            const clubVenues = parseVenueCollections(club.venues);
            const v = clubVenues.find(cv => normalizeVenueToken(cv.id).toLowerCase() === normalizeVenueToken(booking.venueId).toLowerCase());
            if (v) {
              bookingData.venue = {
                id: v.id,
                venueName: v.name || v.venueName || club.name,
                address: v.address || club.address,
                openingHours: v.openingHours || club.openingHours
              };
              break;
            }
          }
        }
      }

      return {
        ...bookingData,
        isCreator,
        needsAction: false,
        displayOpponent: otherPlayer,
        opponentName: otherPlayer?.nickname || otherPlayer?.name || "Unknown",
        actionLabel: null,
        contextName:
          bookingData.tournament?.name ||
          bookingData.league?.name ||
          null,
        bookingType:
          bookingData.bookingType ||
          (bookingData.leagueId ? "league" : "tournament"),
        venueName: bookingData.venue?.venueName || booking.venue?.venueName || booking.venueId || 'Unknown Venue',
      };
    });

    res.json({
      success: true,
      data: formattedBookings,
      message: "Completed bookings retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// CONFIRM BOOKING
// ============================================

/**
 * Confirm a pending booking (opponent confirms)
 */
exports.confirmBooking = async (req, res) => {
  try {
    const { userId } = req.user;
    const { bookingId } = req.params;

    // Find player profile IDs (Unify by email for dual-role users)
    const playerIds = await getAllPlayerIdsForUser(userId);

    if (!playerIds || playerIds.length === 0) {
      return res.status(404).json({ success: false, error: "No player profile found. Please ensure you have a player profile linked to your account." });
    }

    const booking = await Booking.findByPk(bookingId, {
      include: [
        {
          association: "player",
          attributes: ["id", "name"]
        },
        {
          association: "opponent",
          attributes: ["id", "name"]
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({ success: false, error: "Booking not found" });
    }

    // Verify the logged-in player is the opponent
    if (!playerIds.includes(booking.opponentId)) {
      return res.status(403).json({
        success: false,
        error: "Only the opponent can confirm this booking"
      });
    }

    // Verify booking is pending
    if (booking.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: `Booking is already ${booking.status}`
      });
    }

    // Update booking to confirmed
    await booking.update({
      status: "confirmed",
      confirmedAt: new Date(),
      confirmedBy: userId
    });

    // Fetch updated booking with all associations
    const updatedBooking = await Booking.findByPk(bookingId, {
      include: [
        {
          association: "player",
          attributes: ["id", "name", "nickname", "userId"],
          include: [{ association: "user", attributes: ["id", "email"] }]
        },
        {
          association: "opponent",
          attributes: ["id", "name", "nickname", "userId"],
          include: [{ association: "user", attributes: ["id", "email"] }]
        },
        {
          association: "venue",
          attributes: ["id", "venueName", "address"],
          required: false
        },
        {
          association: "league",
          attributes: ["id", "name", "sport"]
        },
        {
          association: "fixture",
          attributes: ["id", "round", "matchNumber"]
        },
        {
          association: "tournament",
          attributes: ["id", "name", "sport"]
        },
        {
          association: "tournamentMatch",
          attributes: ["id", "roundType", "roundNumber"]
        }
      ]
    });

    // Add static venue data if using hardcoded venues

    // Venue name logic: always use the correct dynamic value
    const bookingData = updatedBooking.toJSON();
    let venueName = 'TBD';
    if (bookingData.venue && bookingData.venue.venueName) {
      venueName = bookingData.venue.venueName;
    } else if (typeof bookingData.venueId === 'string' && (bookingData.venueId.startsWith('venue_') || bookingData.venueId.startsWith('virtual_'))) {
      // Try to resolve club/virtual venue name from all clubs
      try {
        const { Club } = require("../models");
        const allClubs = await Club.findAll();
        let found = false;
        for (const club of allClubs) {
          if (!club.venues) continue;
          let clubVenues = [];
          try {
            clubVenues = typeof club.venues === "string" ? JSON.parse(club.venues) : Array.isArray(club.venues) ? club.venues : Object.values(club.venues);
          } catch (e) { continue; }
          // Remove 'venue_' or 'virtual_' prefix to match club venue
          const venueNameToMatch = bookingData.venueId.replace(/^(venue_|virtual_)/, '');
          const matchedVenue = clubVenues.find((v) => v.id === venueNameToMatch || v.name === venueNameToMatch || v.id === bookingData.venueId || v.name === bookingData.venueId);
          if (matchedVenue) {
            venueName = matchedVenue.name;
            found = true;
            break;
          }
        }
        if (!found) {
          // fallback to stripping prefix (legacy fallback)
          venueName = bookingData.venueId.replace(/^(venue_|virtual_)/, '');
        }
      } catch (e) {
        // fallback to stripping prefix (legacy fallback)
        venueName = bookingData.venueId.replace(/^(venue_|virtual_)/, '');
      }
    } else if (bookingData.venueId === 1) {
      venueName = 'Berrow';
    } else if (bookingData.venueId === 2) {
      venueName = 'Highbridge';
    }

    // Send confirmation emails to both players
    try {
      const timeSlot = `${updatedBooking.startTime} - ${updatedBooking.endTime}`;
      const bookingType = updatedBooking.bookingType;
      const roundLabel = bookingType === 'tournament'
        ? (updatedBooking.tournamentMatch?.roundType || updatedBooking.tournamentMatch?.roundNumber || 'TBD')
        : (updatedBooking.fixture?.round || 'TBD');
      const contextName = bookingType === 'tournament'
        ? (updatedBooking.tournament?.name || 'TBD')
        : (updatedBooking.league?.name || 'TBD');
      const matchSport = updatedBooking.sport || updatedBooking.league?.sport || 'snooker';

      // Get User records to send emails
      const playerUser = updatedBooking.player.user;
      const opponentUser = updatedBooking.opponent.user;

      // Send email to booking creator
      if (playerUser && playerUser.email) {
        await sendBookingConfirmedEmail({
          playerEmail: playerUser.email,
          playerName: updatedBooking.player.nickname || updatedBooking.player.name,
          opponentName: updatedBooking.opponent.nickname || updatedBooking.opponent.name,
          matchDetails: { sport: updatedBooking.league.sport },
          leagueName: leagueName,
          fixtureRound: fixtureRound,
          bookingDate: updatedBooking.bookingDate,
          venueName: venueName,
          timeSlot: timeSlot
        });
      }

      // Send email to opponent
      if (opponentUser && opponentUser.email) {
        await sendBookingConfirmedEmail({
          playerEmail: opponentUser.email,
          playerName: updatedBooking.opponent.nickname || updatedBooking.opponent.name,
          opponentName: updatedBooking.player.nickname || updatedBooking.player.name,
          matchDetails: { sport: updatedBooking.league.sport },
          leagueName: leagueName,
          fixtureRound: fixtureRound,
          bookingDate: updatedBooking.bookingDate,
          venueName: venueName,
          timeSlot: timeSlot
        });
      }
    } catch (emailError) {
      // Don't fail the confirmation if email fails
    }

    res.json({
      success: true,
      data: bookingData,
      message: "Booking confirmed successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Reject a pending booking (opponent rejects)
 */
exports.rejectBooking = async (req, res) => {
  try {
    const { userId } = req.user;
    const { bookingId } = req.params;
    const { reason } = req.body;

    // Find player profile IDs (Unify by email for dual-role users)
    const playerIds = await getAllPlayerIdsForUser(userId);

    if (!playerIds || playerIds.length === 0) {
      return res.status(404).json({ success: false, error: "No player profile found. Please ensure you have a player profile linked to your account." });
    }

    const booking = await Booking.findByPk(bookingId, {
      include: [
        {
          association: "player",
          attributes: ["id", "name"]
        },
        {
          association: "opponent",
          attributes: ["id", "name"]
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({ success: false, error: "Booking not found" });
    }

    // Verify the logged-in player is the opponent
    if (!playerIds.includes(booking.opponentId)) {
      return res.status(403).json({
        success: false,
        error: "Only the opponent can reject this booking"
      });
    }

    // Verify booking is pending
    if (booking.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: `Booking is already ${booking.status} and cannot be rejected`
      });
    }

    // Update booking to rejected
    await booking.update({
      status: "rejected",
      rejectedAt: new Date(),
      rejectedBy: userId,
      rejectionReason: reason || "No reason provided"
    });

    // Fetch updated booking with all associations
    const updatedBooking = await Booking.findByPk(bookingId, {
      include: [
        {
          association: "player",
          attributes: ["id", "name", "nickname", "userId"],
          include: [{ association: "user", attributes: ["id", "email"] }]
        },
        {
          association: "opponent",
          attributes: ["id", "name", "nickname", "userId"],
          include: [{ association: "user", attributes: ["id", "email"] }]
        },
        {
          association: "venue",
          attributes: ["id", "venueName", "address"],
          required: false
        },
        {
          association: "league",
          attributes: ["id", "name", "sport"]
        },
        {
          association: "fixture",
          attributes: ["id", "round", "matchNumber"]
        },
        {
          association: "tournament",
          attributes: ["id", "name", "sport"]
        },
        {
          association: "tournamentMatch",
          attributes: ["id", "roundType", "roundNumber"]
        }
      ]
    });

    // Add static venue data if using hardcoded venues
    const bookingData = updatedBooking.toJSON();
    if (booking.venueId) {
      bookingData.venue = booking.venueId === 1 ?
        { id: 1, venueName: 'Berrow', address: 'Berrow Recreation Club, Berrow Road' } :
        { id: 2, venueName: 'Highbridge', address: 'Highbridge Community Centre, Church Street' };
    }

    // Send rejection email to booking creator
    try {
      const bookingType = updatedBooking.bookingType;
      const roundLabel = bookingType === 'tournament'
        ? (updatedBooking.tournamentMatch?.roundType || updatedBooking.tournamentMatch?.roundNumber || 'TBD')
        : (updatedBooking.fixture?.round || 'TBD');
      const contextName = bookingType === 'tournament'
        ? (updatedBooking.tournament?.name || 'TBD')
        : (updatedBooking.league?.name || 'TBD');
      const matchSport = updatedBooking.sport || updatedBooking.league?.sport || 'snooker';

      // Get User records to send emails
      const playerUser = updatedBooking.player.user;

      // Send email to booking creator
      if (playerUser && playerUser.email) {
        if (bookingType === 'tournament') {
          await sendTournamentBookingRejectedEmail({
            playerEmail: playerUser.email,
            playerName: updatedBooking.player.nickname || updatedBooking.player.name,
            opponentName: updatedBooking.opponent.nickname || updatedBooking.opponent.name,
            matchDetails: { sport: matchSport },
            tournamentName: contextName,
            roundLabel,
            rejectionReason: reason || "No reason provided"
          });
        } else {
          await sendBookingRejectedEmail({
            playerEmail: playerUser.email,
            playerName: updatedBooking.player.nickname || updatedBooking.player.name,
            opponentName: updatedBooking.opponent.nickname || updatedBooking.opponent.name,
            matchDetails: { sport: matchSport },
            leagueName: contextName,
            fixtureRound: roundLabel,
            rejectionReason: reason || "No reason provided"
          });
        }
      }
    } catch (emailError) {
      // Don't fail the rejection if email fails
    }

    res.json({
      success: true,
      data: bookingData,
      message: "Booking rejected successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// CANCEL BOOKING
// ============================================

/**
 * Cancel a booking
 * Can be done by either player
 */
exports.cancelBooking = async (req, res) => {
  try {
    const { userId } = req.user;
    const { bookingId } = req.params;
    const { reason } = req.body;

    // Find player profile IDs (Unify by email for dual-role users)
    const playerIds = await getAllPlayerIdsForUser(userId);

    if (!playerIds || playerIds.length === 0) {
      return res.status(404).json({ success: false, error: "No player profile found. Please ensure you have a player profile linked to your account." });
    }

    const booking = await Booking.findByPk(bookingId, {
      include: [
        {
          association: "player",
          attributes: ["id", "name", "nickname", "userId"],
          include: [{ association: "user", attributes: ["id", "email"] }]
        },
        {
          association: "opponent",
          attributes: ["id", "name", "nickname", "userId"],
          include: [{ association: "user", attributes: ["id", "email"] }]
        },
        { association: "league", attributes: ["id", "name", "sport"] },
        { association: "fixture", attributes: ["id", "round"] },
        { association: "venue", attributes: ["id", "venueName"] }
      ]
    });

    if (!booking) {
      return res.status(404).json({ success: false, error: "Booking not found" });
    }

    // Verify the logged-in player is involved in this booking
    if (!playerIds.includes(booking.playerId) && !playerIds.includes(booking.opponentId)) {
      return res.status(403).json({
        success: false,
        error: "You are not authorized to cancel this booking"
      });
    }

    // Verify booking is not already cancelled or completed
    if (booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        error: "Booking is already cancelled"
      });
    }

    if (booking.status === "completed") {
      return res.status(400).json({
        success: false,
        error: "Cannot cancel a completed booking"
      });
    }

    // Cancel the booking
    await booking.update({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledBy: userId,
      cancellationReason: reason || "No reason provided"
    });

    res.json({
      success: true,
      data: booking,
      message: "Booking cancelled successfully"
    });

    // Send cancellation email to the other player
    try {
      const isCreator = playerIds.includes(booking.playerId);
      const recipientUser = isCreator ? booking.opponent.user : booking.player.user;
      const senderName = isCreator ? (booking.player.nickname || booking.player.name) : (booking.opponent.nickname || booking.opponent.name);

      if (recipientUser && recipientUser.email) {
        await sendBookingCancelledEmail({
          recipientEmail: recipientUser.email,
          recipientName: isCreator ? (booking.opponent.nickname || booking.opponent.name) : (booking.player.nickname || booking.player.name),
          senderName: senderName,
          matchDetails: { sport: booking.league.sport },
          leagueName: booking.league.name,
          fixtureRound: booking.fixture.round,
          bookingDate: booking.bookingDate,
          timeSlot: `${booking.startTime} - ${booking.endTime}`,
          venueName: booking.venue?.venueName || 'TBD',
          cancellationReason: reason || "No reason provided"
        });
      }
    } catch (emailError) {
      console.error("Cancellation email error:", emailError);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get all pooker leagues where the logged-in player has matches
 */
exports.getPookerLeagues = async (req, res) => {
  try {
    const { userId } = req.user;
    const playerIds = await getAllPlayerIdsForUser(userId);
    if (!playerIds || playerIds.length === 0) {
      return res.status(404).json({ success: false, error: "No player profiles found." });
    }

    const fixtures = await Fixture.findAll({
      where: {
        [Op.or]: [
          { player1Id: { [Op.in]: playerIds } },
          { player2Id: { [Op.in]: playerIds } }
        ],
        status: { [Op.in]: ["scheduled", "upcoming", "in_progress"] }
      },
      include: [{
        association: "league",
        required: true,
        where: {
          sport: { [Op.in]: ["pooker", "poker", "Pooker", "Poker"] },
          status: "active"
        },
        include: [
          { association: "season", required: false, attributes: ["id", "name", "startDate", "endDate"] },
          { association: "leaguePlayers", attributes: ["playerId"] }
        ]
      }]
    });

    if (fixtures.length === 0) {
      const allLeagues = await League.findAll({
        where: {
          sport: { [Op.in]: ["pooker", "poker", "Pooker", "Poker"] },
          status: "active"
        },
        include: [
          { association: "season", required: false, attributes: ["id", "name", "startDate", "endDate"] },
          { association: "leaguePlayers", attributes: ["playerId"] }
        ]
      });

      const leagues = allLeagues
        .filter(l => l.leaguePlayers.some(lp => playerIds.includes(lp.playerId)))
        .map(l => ({
          id: l.id, name: l.name,
          seasonName: l.season?.name || "Unknown Season",
          bookingStartDate: l.season?.startDate || l.leagueStartDate,
          bookingEndDate: l.season?.endDate || l.leagueEndDate,
          leagueStartDate: l.leagueStartDate || l.season?.startDate,
          leagueEndDate: l.leagueEndDate || l.season?.endDate,
          matchCount: 0, sport: l.sport, format: l.format,
          note: "No scheduled matches yet. Available for booking.",
          leaguePlayers: l.leaguePlayers || []
        }));

      return res.json({ success: true, data: leagues, message: `Showing ${leagues.length} available pooker league(s).` });
    }

    const leagueMap = new Map();
    fixtures.forEach(f => {
      const l = f.league;
      if (!leagueMap.has(l.id)) {
        leagueMap.set(l.id, {
          id: l.id, name: l.name,
          seasonName: l.season?.name || "Unknown Season",
          bookingStartDate: l.season?.startDate || l.leagueStartDate,
          bookingEndDate: l.season?.endDate || l.leagueEndDate,
          leagueStartDate: l.leagueStartDate || l.season?.startDate,
          leagueEndDate: l.leagueEndDate || l.season?.endDate,
          matchCount: 0, sport: l.sport, format: l.format,
          leaguePlayers: l.leaguePlayers || []
        });
      }
      leagueMap.get(l.id).matchCount++;
    });

    res.json({ success: true, data: Array.from(leagueMap.values()), message: "Pooker leagues retrieved successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get all pooker matches for a specific league where the logged-in player participates
 */
exports.getPookerMatches = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;

    const player = await getOrCreatePlayerProfile(userId);
    if (!player) {
      return res.status(404).json({ success: false, error: "No player profile found." });
    }

    const league = await League.findOne({
      where: {
        id: leagueId,
        sport: { [Op.in]: ["pooker", "poker", "Pooker", "Poker"] }
      },
      include: [{ association: "season", attributes: ["id", "name", "startDate", "endDate"] }]
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found or not a pooker league" });
    }

    const playerIds = await getAllPlayerIdsForUser(userId);
    const fixtures = await Fixture.findAll({
      where: {
        leagueId,
        [Op.or]: [{ player1Id: { [Op.in]: playerIds } }, { player2Id: { [Op.in]: playerIds } }],
        status: { [Op.in]: ["scheduled", "in_progress"] }
      },
      include: [
        { association: "player1", attributes: ["id", "name", "nickname"], include: [{ association: "user", attributes: ["email"] }] },
        { association: "player2", attributes: ["id", "name", "nickname"], include: [{ association: "user", attributes: ["email"] }] },
        { association: "league", attributes: ["id", "name", "sport"] }
      ],
      order: [["round", "ASC"], ["matchNumber", "ASC"]]
    });

    const fixtureIds = fixtures.map(f => f.id);
    const existingBookings = await Booking.findAll({
      where: { fixtureId: { [Op.in]: fixtureIds }, status: { [Op.in]: ["pending", "confirmed"] } },
      attributes: ["id", "fixtureId", "status"]
    });
    const bookingsByFixture = {};
    existingBookings.forEach(b => { bookingsByFixture[b.fixtureId] = { id: b.id, status: b.status }; });

    const matches = fixtures.map(fixture => {
      const isPlayer1 = playerIds.includes(fixture.player1Id);
      const opponent = isPlayer1 ? fixture.player2 : fixture.player1;
      return {
        matchId: fixture.id, fixtureId: fixture.id, leagueId: league.id,
        leagueName: league.name, round: fixture.round, matchNumber: fixture.matchNumber,
        opponentId: opponent?.id, opponentName: `vs ${opponent?.nickname || opponent?.name || "Unknown"}`,
        bookingStartDate: league.season?.startDate || league.leagueStartDate,
        bookingEndDate: league.season?.endDate || league.leagueEndDate,
        leagueStartDate: league.leagueStartDate || league.season?.startDate,
        leagueEndDate: league.leagueEndDate || league.season?.endDate,
        sport: "pooker",
        hasBooking: !!bookingsByFixture[fixture.id],
        bookingStatus: bookingsByFixture[fixture.id]?.status || null,
        bookingId: bookingsByFixture[fixture.id]?.id || null
      };
    });

    res.json({ success: true, data: { matches }, message: "Pooker league matches retrieved successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
/**
 * GET GAME STATS for the logged-in player
 * Returns counts of active leagues for each sport
 */
exports.getGameStats = async (req, res) => {
  try {
    const { userId } = req.user;
    const playerIds = await getAllPlayerIdsForUser(userId);

    if (!playerIds || playerIds.length === 0) {
      return res.json({
        success: true,
        data: { snooker: 0, pool: 0, pooker: 0, poker: 0 },
        message: "No player profile found"
      });
    }

    const sports = ["snooker", "pool", "pooker", "poker"];
    const stats = { snooker: 0, pool: 0, pooker: 0 };

    // Query 1: Count active leagues per sport
    const leagueCounts = await League.findAll({
      attributes: [
        'sport',
        [sequelize.fn('COUNT', sequelize.col('League.id')), 'count']
      ],
      where: {
        status: "active"
      },
      include: [
        {
          model: LeaguePlayer,
          as: "leaguePlayers",
          required: true,
          where: { playerId: { [Op.in]: playerIds } },
          attributes: []
        }
      ],
      group: ['League.sport'],
      raw: true,
      subQuery: false
    });

    // Build league count map with case-insensitive normalization
    leagueCounts.forEach(row => {
      const sportLower = (row.sport || "").toLowerCase();
      const targetSport = (sportLower === 'poker' || sportLower === 'pooker') ? 'pooker' : sportLower;
      if (stats.hasOwnProperty(targetSport)) {
        stats[targetSport] += parseInt(row.count, 10);
      }
    });

    // Query 2: Count pending bookings per sport
    const bookingCounts = await Booking.findAll({
      attributes: [
        'sport',
        [sequelize.fn('COUNT', sequelize.col('Booking.id')), 'count']
      ],
      where: {
        status: "pending",
        [Op.or]: [
          { playerId: { [Op.in]: playerIds } },
          { opponentId: { [Op.in]: playerIds } }
        ]
      },
      group: ['Booking.sport'],
      raw: true
    });

    // Build pending count map
    bookingCounts.forEach(row => {
      const sportLower = (row.sport || "").toLowerCase();
      const targetSport = (sportLower === 'poker' || sportLower === 'pooker') ? 'pooker' : sportLower;
      const sportKey = `pending${targetSport.charAt(0).toUpperCase()}${targetSport.slice(1)}`;

      if (!stats[sportKey]) stats[sportKey] = 0;
      stats[sportKey] += parseInt(row.count, 10);
    });

    res.json({
      success: true,
      data: stats,
      message: "Game stats retrieved successfully"
    });
  } catch (error) {
    console.error("[getGameStats] Error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================
// GET MONTHLY AVAILABILITY
// ============================================

/**
 * Get availability status (has open slots) for every day in a month for a venue
 * Returns an object mapping YYYY-MM-DD to boolean true/false
 */
exports.getMonthlyAvailability = async (req, res) => {
  try {
    const { venueId, month, year } = req.query;

    if (!venueId || !month || !year) {
      return res.status(400).json({
        success: false,
        error: "venueId, month (1-12), and year are required"
      });
    }

    const monthInt = parseInt(month);
    const yearInt = parseInt(year);

    // Get the number of days in the month
    const daysInMonth = new Date(yearInt, monthInt, 0).getDate();
    const startDateStr = `${yearInt}-${String(monthInt).padStart(2, '0')}-01`;
    const endDateStr = `${yearInt}-${String(monthInt).padStart(2, '0')}-${daysInMonth}`;

    // Handle static/club venues lookup logic (same as getAvailableTimeSlots)
    let venue = null;
    let customSlots = [];
    let customTables = [];

    if (venueId === '1' || parseInt(venueId) === 1) {
      venue = { id: 1, venueName: 'Berrow', numberOfTables: 2 };
    } else if (venueId === '2' || parseInt(venueId) === 2) {
      venue = { id: 2, venueName: 'Highbridge', numberOfTables: 1 };
    } else if (String(venueId).startsWith('venue_') || String(venueId).startsWith('virtual_')) {
      const allClubs = await Club.findAll();
      for (const club of allClubs) {
        if (!club.venues) continue;
        let clubVenues = [];
        try {
          clubVenues = typeof club.venues === 'string' ? JSON.parse(club.venues) : club.venues;
        } catch (e) { continue; }
        const matchedVenue = (Array.isArray(clubVenues) ? clubVenues : []).find(v => v.id === venueId || v.name === venueId);
        if (matchedVenue) {
          venue = { id: matchedVenue.id, venueName: matchedVenue.name, numberOfTables: Array.isArray(matchedVenue.tables) ? matchedVenue.tables.length : 0 };
          customSlots = Array.isArray(matchedVenue.slots) ? matchedVenue.slots : [];
          customTables = Array.isArray(matchedVenue.tables) ? matchedVenue.tables : [];
          break;
        }
      }
    } else {
      // Try as a direct VenueOwner ID, or try as a composite ID
      if (String(venueId).includes(':')) {
        // Handle composite venue ID: ownerId:venueRef
        const { VenueOwner: VenueOwnerModel } = require("../models");
        const [ownerId, venueRef] = venueId.split(":");
        const venueOwner = await VenueOwnerModel.findByPk(ownerId);
        if (venueOwner) {
          let matchedOwnerVenue = null;

          // First, try to find in VenueOwner.venues array
          const ownerVenues = parseVenueCollections(venueOwner.venues);
          matchedOwnerVenue = ownerVenues.find((v) => {
            const vid = String(v?.id || v?.venueId || "").trim();
            const vname = String(v?.name || v?.venueName || "").trim();
            return vid === String(venueRef).trim() || vname === String(venueRef).trim();
          });

          // If not found, search in Club.venues
          if (!matchedOwnerVenue) {
            const allClubs = await Club.findAll({ attributes: ["id", "venues"] });
            for (const club of allClubs) {
              const clubVenues = parseVenueCollections(club.venues);
              matchedOwnerVenue = clubVenues.find(v => {
                const vid = String(v?.id || v?.venueId || "").trim();
                return vid === String(venueRef).trim();
              });
              if (matchedOwnerVenue) break;
            }
          }

          if (matchedOwnerVenue) {
            venue = {
              id: venueId,
              venueName: matchedOwnerVenue.name || matchedOwnerVenue.venueName || venueOwner.venueName,
              numberOfTables: Array.isArray(matchedOwnerVenue.tables) ? matchedOwnerVenue.tables.length : 0
            };
            customSlots = Array.isArray(matchedOwnerVenue.slots) ? matchedOwnerVenue.slots : [];
            customTables = Array.isArray(matchedOwnerVenue.tables) ? matchedOwnerVenue.tables : [];
          }
        }
      } else {
        venue = await VenueOwner.findByPk(venueId);
      }
    }

    if (!venue) {
      // Return empty availability for non-existent venues instead of 404
      const availability = {};
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${yearInt}-${String(monthInt).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        availability[dateStr] = false;
      }
      return res.status(200).json({
        success: true,
        data: availability
      });
    }

    // Get all bookings for this venue for the entire month
    const bookingWhere = {
      bookingDate: { [Op.between]: [startDateStr, endDateStr] },
      status: { [Op.in]: ["pending", "confirmed"] }
    };

    if (typeof venueId === 'string' && venueId.includes(':')) {
      const [ownerId, vid] = venueId.split(":");
      bookingWhere.venueOwnerId = ownerId;
      bookingWhere.venueId = venueId;
    } else if (venueId === '1' || venueId === '2' || String(venueId).startsWith('venue_') || String(venueId).startsWith('virtual_')) {
      bookingWhere.venueId = venueId;
    } else {
      bookingWhere.venueOwnerId = venueId;
    }

    const bookings = await Booking.findAll({
      where: bookingWhere,
      attributes: ["bookingDate", "tableNumber", "startTime", "endTime", "tableName", "status", "bookingType", "tournamentId"],
      include: [{ association: "tournamentMatch", attributes: ["status"], required: false }]
    });

    // Filter out tournament bookings where match is completed/voided/walkover
    const blockingBookings = bookings.filter(bookingBlocksAvailability);

    // Helper to normalize time
    const normalizeTime = (t) => {
      if (!t) return '';
      const asString = String(t).split('.')[0];
      return asString.length === 5 ? `${asString}:00` : asString;
    };

    const standardTimeSlots = [
      { startTime: "17:00:00", endTime: "19:00:00" },
      { startTime: "19:00:00", endTime: "21:00:00" },
      { startTime: "21:00:00", endTime: "23:00:00" }
    ];

    const availability = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yearInt}-${String(monthInt).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long' });
      const dayBookings = blockingBookings.filter(b => b.bookingDate === dateStr);

      let hasAvailableSlots = false;

      if (customSlots.length > 0) {
        const daySlots = customSlots.filter(s => s.day === dayOfWeek);
        // Check if at least one custom slot is not booked
        hasAvailableSlots = daySlots.some(slot => {
          const tableIndex = customTables.findIndex(t => (typeof t === 'string' ? t === slot.tableName : t.id === slot.tableId));
          const tableNum = tableIndex + 1;
          const tableNameStr = typeof customTables[tableIndex] === 'string' ? customTables[tableIndex] : customTables[tableIndex]?.name;

          return !dayBookings.some(b =>
            (Number(b.tableNumber) === tableNum || b.tableName === tableNameStr) &&
            normalizeTime(b.startTime) === normalizeTime(slot.startTime)
          );
        });
      } else {
        const numTables = venue.numberOfTables || 2;
        // Check standard slots
        hasAvailableSlots = standardTimeSlots.some(slot => {
          for (let t = 1; t <= numTables; t++) {
            if (!dayBookings.some(b => Number(b.tableNumber) === t && normalizeTime(b.startTime) === normalizeTime(slot.startTime))) {
              return true;
            }
          }
          return false;
        });
      }

      availability[dateStr] = hasAvailableSlots;
    }

    res.json({
      success: true,
      data: availability,
      message: "Monthly availability retrieved successfully"
    });
  } catch (error) {
    console.error("[getMonthlyAvailability] Error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// DEBUG ENDPOINT - Inspect venue and league data
exports.debugVenueData = async (req, res) => {
  try {
    const { leagueId, clubId } = req.query;
    const { League, Club } = require("../models");

    const diagnostics = {
      timestamp: new Date().toISOString(),
      leagueId,
      clubId,
      data: {}
    };

    // Get league data
    if (leagueId) {
      const league = await League.findByPk(leagueId);
      if (league) {
        diagnostics.data.league = {
          id: league.id,
          name: league.name,
          clubId: league.clubId,
          venueIds_raw: league.venueIds,
          venueIds_type: typeof league.venueIds,
          venueIds_isArray: Array.isArray(league.venueIds),
          venueIds_parsed: (() => {
            try {
              if (typeof league.venueIds === 'string') {
                return JSON.parse(league.venueIds);
              }
              return league.venueIds;
            } catch (e) {
              return `ERROR: ${e.message}`;
            }
          })()
        };
      }
    }

    // Get club venues
    const cId = clubId || (diagnostics.data.league ? diagnostics.data.league.clubId : null);
    if (cId) {
      const club = await Club.findByPk(cId);
      if (club) {
        let venuesArray = [];
        try {
          if (typeof club.venues === 'string') {
            venuesArray = JSON.parse(club.venues);
          } else if (Array.isArray(club.venues)) {
            venuesArray = club.venues;
          } else if (typeof club.venues === 'object') {
            venuesArray = Object.values(club.venues);
          }
        } catch (e) {
          // Already handled by Club getter
        }

        diagnostics.data.club = {
          id: club.id,
          name: club.name,
          venues_count: venuesArray.length,
          venues_raw: club.venues,
          venues_type: typeof club.venues,
          venues_isArray: Array.isArray(club.venues),
          venues_sample: venuesArray.slice(0, 3).map(v => ({
            id: v?.id,
            name: v?.name,
            keys: Object.keys(v || {})
          }))
        };
      }
    }

    // Try matching
    if (leagueId && cId) {
      const league = await League.findByPk(leagueId);
      const club = await Club.findByPk(cId);

      let venueIdsList = [];
      try {
        if (typeof league.venueIds === 'string') {
          venueIdsList = JSON.parse(league.venueIds);
        } else if (Array.isArray(league.venueIds)) {
          venueIdsList = league.venueIds;
        }
      } catch (e) {
        diagnostics.data.parsing_error = e.message;
      }

      let clubVenues = [];
      try {
        if (typeof club.venues === 'string') {
          clubVenues = JSON.parse(club.venues);
        } else if (Array.isArray(club.venues)) {
          clubVenues = club.venues;
        } else if (typeof club.venues === 'object') {
          clubVenues = Object.values(club.venues);
        }
      } catch (e) {
        diagnostics.data.club_parsing_error = e.message;
      }

      const matchingDetails = {
        venueIdsList,
        clubVenuesCount: clubVenues.length,
        matchingAttempts: []
      };

      for (const vid of venueIdsList) {
        const vidStr = String(vid).toLowerCase().trim();
        const matches = clubVenues.filter(v => {
          const vName = (v?.name || '').toLowerCase().trim();
          const vId = (v?.id || v?.venueId || '').toLowerCase().trim();
          return vName === vidStr || vId === vidStr;
        });

        matchingDetails.matchingAttempts.push({
          searchingFor: vid,
          searchingFor_lowercase: vidStr,
          foundMatches: matches.length,
          matchedVenues: matches.map(m => ({
            name: m?.name,
            id: m?.id,
            venueId: m?.venueId
          }))
        });
      }

      diagnostics.data.matching = matchingDetails;
    }

    res.json({
      success: true,
      diagnostics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

module.exports = exports;
