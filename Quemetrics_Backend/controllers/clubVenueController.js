const crypto = require("crypto");
const { ClubVenue, Club, VenueOwner, User, Organization, ClubMember } = require("../models");
const { ensureClubVenueSchema } = require("../utils/ensureClubVenueSchema");
const { Op } = require("sequelize");
const sequelize = require("../config/db");

const asArray = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeVenueTables = (rawTables) =>
  asArray(rawTables)
    .map((table) => {
      if (typeof table === "string") return table.trim();
      if (table && typeof table === "object") {
        const candidate = table.name || table.label || table.value;
        return typeof candidate === "string" ? candidate.trim() : "";
      }
      return "";
    })
    .filter(Boolean);

const normalizeVenueSlots = (rawSlots) =>
  asArray(rawSlots)
    .map((slot) => {
      if (!slot || typeof slot !== "object") return null;
      const day = typeof slot.day === "string" ? slot.day.trim() : "";
      const startTime = typeof slot.startTime === "string" ? slot.startTime.trim() : "";
      const endTime = typeof slot.endTime === "string" ? slot.endTime.trim() : "";
      const tableName =
        typeof slot.tableName === "string"
          ? slot.tableName.trim()
          : typeof slot.table === "string"
            ? slot.table.trim()
            : null;

      if (!day || !startTime || !endTime) return null;
      return {
        day,
        startTime,
        endTime,
        tableName: tableName || null,
      };
    })
    .filter(Boolean);

const isVenueOwnerAutoAssignmentEnabled = () => {
  const raw = String(process.env.ENABLE_VENUE_OWNER_ROLE || "true").trim().toLowerCase();
  return !["false", "0", "off", "no"].includes(raw);
};

const deriveVenueOwnerName = ({ club, user }) => {
  if (club?.contactPerson) return club.contactPerson;
  if (club?.name) return club.name;
  if (user?.email) return user.email.split("@")[0];
  return "Venue Owner";
};

const hasClubVenueWriteAccess = async (club, reqUser) => {
  const activeRoleSet = new Set([
    reqUser?.role,
    reqUser?.primaryRole,
    ...(Array.isArray(reqUser?.roles) ? reqUser.roles : []),
  ].filter(Boolean));

  if (activeRoleSet.has("super_admin")) {
    return true;
  }

  const [organization, membership] = await Promise.all([
    Organization.findOne({
      where: { userId: reqUser.userId, id: club.organizationId },
      attributes: ["id"],
    }),
    ClubMember.findOne({
      where: {
        clubId: club.id,
        userId: reqUser.userId,
        status: "active",
        role: { [Op.in]: ["club_admin", "assistant_admin"] },
      },
      attributes: ["id"],
    }),
  ]);

  return !!organization || !!membership;
};

const linkVenueToOwnerProfile = async ({ club, userId, venueId, venueName, transaction }) => {
  if (!isVenueOwnerAutoAssignmentEnabled()) {
    return { enabled: false, assigned: false, createdProfile: false, duplicate: false, venueOwnerId: null };
  }

  const user = await User.findByPk(userId, {
    attributes: ["id", "email"],
    transaction,
  });
  if (!user) {
    return { enabled: true, assigned: false, createdProfile: false, duplicate: false, venueOwnerId: null };
  }

  let venueOwner = await VenueOwner.findOne({ where: { userId }, transaction });
  if (!venueOwner && user.email) {
    venueOwner = await VenueOwner.findOne({ where: { email: user.email }, transaction });
  }

  const initialVenueIds = Array.isArray(venueOwner?.venueIds) ? venueOwner.venueIds : [];
  const normalizedVenueIds = initialVenueIds.map((id) => String(id).trim()).filter(Boolean);
  const venueAlreadyLinked = normalizedVenueIds.includes(String(venueId));

  if (!venueOwner) {
    venueOwner = await VenueOwner.create(
      {
        organizationId: club.organizationId,
        userId,
        email: user.email,
        name: deriveVenueOwnerName({ club, user }),
        phoneNumber: club.phone || null,
        venueName,
        status: "active",
        isInviteAccepted: true,
        venueIds: [String(venueId)],
      },
      { transaction }
    );

    return {
      enabled: true,
      assigned: true,
      createdProfile: true,
      duplicate: false,
      venueOwnerId: venueOwner.id,
    };
  }

  const nextUpdates = {};
  if (!venueOwner.userId) nextUpdates.userId = userId;
  if (!venueOwner.organizationId) nextUpdates.organizationId = club.organizationId;
  if (!venueOwner.email && user.email) nextUpdates.email = user.email;
  if (!venueOwner.name) nextUpdates.name = deriveVenueOwnerName({ club, user });
  if (!venueOwner.venueName) nextUpdates.venueName = venueName;
  if (!venueAlreadyLinked) {
    nextUpdates.venueIds = [...normalizedVenueIds, String(venueId)];
  }

  if (Object.keys(nextUpdates).length > 0) {
    await venueOwner.update(nextUpdates, { transaction });
  }

  return {
    enabled: true,
    assigned: true,
    createdProfile: false,
    duplicate: venueAlreadyLinked,
    venueOwnerId: venueOwner.id,
  };
};

const toApiVenue = (row) => {
  const data = row.toJSON ? row.toJSON() : row;
  const id = data.venueRef || data.id;
  const fromOwner = data.venue ? (data.venue.venueName || data.venue.name) : null;
  return {
    id,
    clubVenueId: data.id,
    venueOwnerId: data.venueOwnerId || null,
    name: data.venueName || fromOwner || "Club Venue",
    tables: asArray(data.tables),
    slots: asArray(data.slots),
    isPrimary: !!data.isPrimary,
    sourceType: data.sourceType || "embedded_club",
    createdAt: data.createdAt,
    createdBy: data.linkedBy,
    updatedAt: data.updatedAt,
  };
};

const mirrorClubVenuesCache = async (clubId) => {
  const [club, rows] = await Promise.all([
    Club.findByPk(clubId),
    ClubVenue.findAll({
      where: { clubId, status: "active" },
      include: [{ model: VenueOwner, as: "venue", required: false }],
      order: [["createdAt", "ASC"]],
    }),
  ]);
  if (!club) return [];
  const list = rows.map(toApiVenue);
  await club.update({ venues: list });
  return list;
};

// ===========================
// VENUE MANAGEMENT FOR CLUBS
// ===========================

/**
 * Get all venues for a club
 */
exports.getClubVenues = async (req, res) => {
  try {
    const { clubId } = req.params;
    await ensureClubVenueSchema();

    // Verify club exists
    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({
        success: false,
        error: "Club not found",
      });
    }

    const rows = await ClubVenue.findAll({
      where: { clubId, status: "active" },
      include: [{ model: VenueOwner, as: "venue", required: false }],
      order: [["createdAt", "ASC"]],
    });

    // Fallback for legacy rows not yet migrated into club_venues.
    if (rows.length === 0 && Array.isArray(club.venues) && club.venues.length > 0) {
      return res.status(200).json({ success: true, data: club.venues });
    }

    const venues = rows.map(toApiVenue);
    await club.update({ venues });

    return res.status(200).json({
      success: true,
      data: venues,
    });
  } catch (error) {
    console.error("getClubVenues error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch venues",
    });
  }
};

/**
 * Create a new venue for a club
 */
exports.createClubVenue = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId } = req.user;
    const { name, tables, slots, venueOwnerId, isPrimary = false } = req.body;
    await ensureClubVenueSchema();

    console.log("=== Create Venue Request ===");
    console.log("Club ID:", clubId);
    console.log("User ID:", userId);
    console.log("Request Body:", JSON.stringify(req.body, null, 2));

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Venue name is required",
      });
    }

    // Verify club exists
    const club = await Club.findByPk(clubId);
    console.log("Club found:", club ? `Yes (${club.name})` : "No");

    if (!club) {
      return res.status(404).json({
        success: false,
        error: "Club not found",
      });
    }

    // Prevent creating venues for pending clubs
    if (club.status === 'pending') {
      return res.status(400).json({
        success: false,
        error: "Cannot create venue for a pending club",
      });
    }

    const canManageClubVenue = await hasClubVenueWriteAccess(club, req.user);
    if (!canManageClubVenue) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to manage venues for this club",
      });
    }

    if (venueOwnerId) {
      const owner = await VenueOwner.findByPk(venueOwnerId);
      if (!owner) {
        return res.status(404).json({ success: false, error: "Venue owner not found" });
      }
    }

    const normalizedTables = normalizeVenueTables(tables);
    const normalizedSlots = normalizeVenueSlots(slots);

    let newVenue;
    let autoAssignment;
    await sequelize.transaction(async (transaction) => {
      newVenue = await ClubVenue.create({
        clubId,
        venueOwnerId: venueOwnerId || null,
        venueRef: venueOwnerId ? null : `venue_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
        venueName: name.trim(),
        tables: normalizedTables,
        slots: normalizedSlots,
        metadata: {},
        sourceType: venueOwnerId ? "linked_owner" : "embedded_club",
        isPrimary: !!isPrimary,
        linkedBy: userId,
        status: "active",
      }, { transaction });

      autoAssignment = venueOwnerId
        ? {
            enabled: isVenueOwnerAutoAssignmentEnabled(),
            assigned: false,
            createdProfile: false,
            duplicate: false,
            venueOwnerId,
          }
        : await linkVenueToOwnerProfile({
            club,
            userId,
            venueId: newVenue.venueRef || newVenue.id,
            venueName: newVenue.venueName,
            transaction,
          });
    });

    console.log("New venue object:", JSON.stringify(newVenue, null, 2));

    await mirrorClubVenuesCache(clubId);

    return res.status(201).json({
      success: true,
      data: {
        ...toApiVenue(newVenue),
        ownership: autoAssignment,
      },
      message: "Venue created successfully",
    });
  } catch (error) {
    console.error("=== createClubVenue ERROR ===");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      error: "Failed to create venue",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update a venue
 */
exports.updateClubVenue = async (req, res) => {
  try {
    const { clubId, venueId } = req.params;
    const { userId } = req.user;
    const { name, tables, slots, isPrimary } = req.body;
    await ensureClubVenueSchema();
    const normalizedTables =
      tables !== undefined ? normalizeVenueTables(tables) : undefined;
    const normalizedSlots =
      slots !== undefined ? normalizeVenueSlots(slots) : undefined;

    // Verify club exists
    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({
        success: false,
        error: "Club not found",
      });
    }

    const canManageClubVenue = await hasClubVenueWriteAccess(club, req.user);
    if (!canManageClubVenue) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to update venues for this club",
      });
    }

    // Try to find and update in ClubVenue table (normalized)
    let venueRow = await ClubVenue.findOne({
      where: {
        clubId,
        status: "active",
        [Op.or]: [{ id: venueId }, { venueRef: venueId }],
      },
      include: [{ model: VenueOwner, as: "venue", required: false }],
    });

    if (venueRow) {
      // Update normalized venue
      await venueRow.update({
        venueName: name !== undefined ? name : venueRow.venueName,
        tables: normalizedTables !== undefined ? normalizedTables : venueRow.tables,
        slots: normalizedSlots !== undefined ? normalizedSlots : venueRow.slots,
        isPrimary: isPrimary !== undefined ? !!isPrimary : venueRow.isPrimary,
        metadata: {
          ...(venueRow.metadata || {}),
          updatedBy: userId,
        },
      });

      await mirrorClubVenuesCache(clubId);

      return res.status(200).json({
        success: true,
        data: toApiVenue(venueRow),
        message: "Venue updated successfully",
      });
    }

    // Fallback: check legacy Club.venues JSON array (embedded venues)
    if (Array.isArray(club.venues)) {
      const venueIndex = club.venues.findIndex(
        (v) => v.id === venueId || v.venueRef === venueId
      );

      if (venueIndex !== -1) {
        // Update embedded venue in JSON array
        const updatedVenue = {
          ...club.venues[venueIndex],
          name: name !== undefined ? name : club.venues[venueIndex].name,
          tables:
            normalizedTables !== undefined
              ? normalizedTables
              : club.venues[venueIndex].tables,
          slots:
            normalizedSlots !== undefined
              ? normalizedSlots
              : club.venues[venueIndex].slots,
          isPrimary: isPrimary !== undefined ? !!isPrimary : club.venues[venueIndex].isPrimary,
          updatedAt: new Date(),
        };

        club.venues[venueIndex] = updatedVenue;
        await club.update({ venues: club.venues });

        return res.status(200).json({
          success: true,
          data: updatedVenue,
          message: "Venue updated successfully",
        });
      }
    }

    // Venue not found in either source
    return res.status(404).json({
      success: false,
      error: "Venue not found",
    });
  } catch (error) {
    console.error("=== updateClubVenue ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      error: "Failed to update venue",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Delete a venue
 */
exports.deleteClubVenue = async (req, res) => {
  try {
    const { clubId, venueId } = req.params;
    await ensureClubVenueSchema();

    // Verify club exists
    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({
        success: false,
        error: "Club not found",
      });
    }

    const canManageClubVenue = await hasClubVenueWriteAccess(club, req.user);
    if (!canManageClubVenue) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to delete venues for this club",
      });
    }

    // Try to find and delete from ClubVenue table
    const venueRow = await ClubVenue.findOne({
      where: {
        clubId,
        status: "active",
        [Op.or]: [{ id: venueId }, { venueRef: venueId }],
      },
    });

    if (venueRow) {
      // Delete from normalized table
      await venueRow.update({ status: "inactive" });
      await mirrorClubVenuesCache(clubId);

      return res.status(200).json({
        success: true,
        message: "Venue deleted successfully",
      });
    }

    // Fallback: check legacy Club.venues JSON array
    if (Array.isArray(club.venues)) {
      const venueIndex = club.venues.findIndex(
        (v) => v.id === venueId || v.venueRef === venueId
      );

      if (venueIndex !== -1) {
        // Remove from JSON array
        club.venues.splice(venueIndex, 1);
        await club.update({ venues: club.venues });

        // Ensure caches are synced
        await mirrorClubVenuesCache(clubId);

        return res.status(200).json({
          success: true,
          message: "Venue deleted successfully",
        });
      }
    }

    // Venue not found in either source
    return res.status(404).json({
      success: false,
      error: "Venue not found",
    });
  } catch (error) {
    console.error("=== deleteClubVenue ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      error: "Failed to delete venue",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
