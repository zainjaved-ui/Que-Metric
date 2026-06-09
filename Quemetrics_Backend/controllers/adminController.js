const {
  Organization,
  Player,
  User,
  AuditLog,
  Season,
  Game,
  NameChangeHistory,
  VenueOwner,
  SuperAdmin,
  EmailVerification,
  ClubMember,
  Club,
} = require("../models");
const { Op, fn, col, where } = require("sequelize");
const sequelize = require("../config/db");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const buildMergedEmailAlias = (primaryEmail, duplicateId) => {
  const [localPartRaw, domainRaw] = String(primaryEmail || "").split("@");
  const localPart = localPartRaw || "merged-user";
  const domain = domainRaw || "merged.local";
  const suffix = `+merged-${String(duplicateId).slice(0, 8)}`;
  return `${localPart.slice(0, Math.max(1, 64 - suffix.length))}${suffix}@${domain}`;
};

exports.getPendingOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.findAll({
      where: { isVerified: false },
      include: [{ model: User, attributes: ["email", "createdAt"] }],
      order: [["createdAt", "ASC"]],
    });

    res.json({ success: true, data: organizations, message: "Pending organizations retrieved" });
  } catch (error) {
    console.error("getPendingOrganizations error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.approveOrganization = async (req, res) => {
  try {
    const { userId } = req.user;
    const { organizationId } = req.params;

    const organization = await Organization.findByPk(organizationId);
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    if (organization.isVerified) {
      return res.status(400).json({ success: false, error: "Organization already verified" });
    }

    await organization.update({ isVerified: true });

    await AuditLog.create({
      userId,
      action: "organization_approved",
      entityType: "organization",
      entityId: organizationId,
      newValue: { isVerified: true },
    });

    res.json({ success: true, data: organization, message: "Organization approved" });
  } catch (error) {
    console.error("approveOrganization error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.rejectOrganization = async (req, res) => {
  try {
    const { userId } = req.user;
    const { organizationId } = req.params;
    const { reason } = req.body;

    const organization = await Organization.findByPk(organizationId, {
      include: [{ model: User }],
    });

    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    await AuditLog.create({
      userId,
      action: "organization_rejected",
      entityType: "organization",
      entityId: organizationId,
      oldValue: { organizationName: organization.organizationName },
      notes: reason,
    });

    // Deactivate user account
    if (organization.User) {
      await organization.User.update({ isActive: false });
    }

    await organization.destroy();

    res.json({ success: true, data: null, message: "Organization rejected" });
  } catch (error) {
    console.error("rejectOrganization error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.getAllOrganizations = async (req, res) => {
  try {
    const { isVerified, page = 1, limit = 20 } = req.query;
    const where = {};

    if (isVerified !== undefined) {
      where.isVerified = isVerified === "true";
    }

    const offset = (page - 1) * limit;

    const { count, rows: organizations } = await Organization.findAndCountAll({
      where,
      include: [{ model: User, attributes: ["email", "isActive", "createdAt"] }],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      success: true,
      data: {
        organizations,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit),
        },
      },
      message: "Organizations retrieved",
    });
  } catch (error) {
    console.error("getAllOrganizations error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.getAllPlayers = async (req, res) => {
  try {
    const { organizationId, sport, page = 1, limit = 20 } = req.query;
    const where = {};

    if (organizationId) where.organizationId = organizationId;

    const offset = (page - 1) * limit;

    const { count, rows: players } = await Player.findAndCountAll({
      where,
      include: [
        { model: User, attributes: ["email", "isActive", "createdAt"] },
        { association: "organization", attributes: ["id", "organizationName"] },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      success: true,
      data: {
        players,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit),
        },
      },
      message: "Players retrieved",
    });
  } catch (error) {
    console.error("getAllPlayers error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.getDuplicateUsers = async (req, res) => {
  try {
    const { email: rawEmail } = req.query;
    const normalizedEmail = normalizeEmail(rawEmail);

    if (normalizedEmail) {
      const users = await User.findAll({
        where: where(fn("LOWER", col("email")), normalizedEmail),
        attributes: ["id", "email", "role", "status", "isActive", "createdAt"],
        order: [["createdAt", "ASC"]],
      });

      return res.json({
        success: true,
        data: {
          email: normalizedEmail,
          duplicateCount: users.length,
          users,
        },
        message: "Duplicate lookup completed",
      });
    }

    const grouped = await sequelize.query(
      `
        SELECT LOWER(email) AS normalizedEmail, COUNT(*) AS duplicateCount
        FROM users
        GROUP BY LOWER(email)
        HAVING COUNT(*) > 1
        ORDER BY duplicateCount DESC, normalizedEmail ASC
      `,
      { type: sequelize.QueryTypes.SELECT }
    );

    const results = [];
    for (const row of grouped) {
      const users = await User.findAll({
        where: where(fn("LOWER", col("email")), row.normalizedEmail),
        attributes: ["id", "email", "role", "status", "isActive", "createdAt"],
        order: [["createdAt", "ASC"]],
      });

      results.push({
        email: row.normalizedEmail,
        duplicateCount: users.length,
        users,
      });
    }

    return res.json({
      success: true,
      data: results,
      message: "Duplicate users retrieved",
    });
  } catch (error) {
    console.error("getDuplicateUsers error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.mergeDuplicateUsers = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { userId: adminUserId } = req.user;
    const { email: rawEmail, primaryUserId, dryRun = false } = req.body;
    const normalizedEmail = normalizeEmail(rawEmail);

    if (!normalizedEmail) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: "email is required" });
    }

    const users = await User.findAll({
      where: where(fn("LOWER", col("email")), normalizedEmail),
      order: [["createdAt", "ASC"]],
      transaction,
    });

    if (users.length < 2) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "No duplicate users found for this email" });
    }

    const primary = primaryUserId
      ? users.find((u) => u.id === primaryUserId)
      : users[0];

    if (!primary) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: "primaryUserId does not belong to this duplicate set" });
    }

    const duplicateUsers = users.filter((u) => u.id !== primary.id);
    const duplicateIds = duplicateUsers.map((u) => u.id);
    const allUserIds = users.map((u) => u.id);

    const oneToOneSets = await Promise.all([
      Player.findAll({ where: { userId: { [Op.in]: allUserIds } }, attributes: ["id", "userId"], transaction }),
      Organization.findAll({ where: { userId: { [Op.in]: allUserIds } }, attributes: ["id", "userId"], transaction }),
      VenueOwner.findAll({ where: { userId: { [Op.in]: allUserIds } }, attributes: ["id", "userId"], transaction }),
      SuperAdmin.findAll({ where: { userId: { [Op.in]: allUserIds } }, attributes: ["id", "userId"], transaction }),
    ]);

    const oneToOneLabels = ["player", "organization", "venue_owner", "super_admin"];
    const conflicts = {};
    oneToOneSets.forEach((records, idx) => {
      if (records.length > 1) {
        conflicts[oneToOneLabels[idx]] = records.map((r) => ({ id: r.id, userId: r.userId }));
      }
    });

    if (Object.keys(conflicts).length > 0) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        error: "Cannot auto-merge duplicates because conflicting one-to-one profiles were found.",
        conflicts,
      });
    }

    const plan = {
      primaryUserId: primary.id,
      duplicateUserIds: duplicateIds,
      duplicateCount: duplicateIds.length,
    };

    if (dryRun) {
      await transaction.rollback();
      return res.json({ success: true, data: plan, message: "Dry run complete. No data changed." });
    }

    await Player.update({ userId: primary.id }, { where: { userId: { [Op.in]: duplicateIds } }, transaction });
    await Organization.update({ userId: primary.id }, { where: { userId: { [Op.in]: duplicateIds } }, transaction });
    await VenueOwner.update({ userId: primary.id }, { where: { userId: { [Op.in]: duplicateIds } }, transaction });
    await SuperAdmin.update({ userId: primary.id }, { where: { userId: { [Op.in]: duplicateIds } }, transaction });
    await EmailVerification.update({ userId: primary.id }, { where: { userId: { [Op.in]: duplicateIds } }, transaction });
    await ClubMember.update({ userId: primary.id }, { where: { userId: { [Op.in]: duplicateIds } }, transaction });
    await Club.update({ createdBy: primary.id }, { where: { createdBy: { [Op.in]: duplicateIds } }, transaction });
    await AuditLog.update({ userId: primary.id }, { where: { userId: { [Op.in]: duplicateIds } }, transaction });

    for (const duplicateUser of duplicateUsers) {
      await duplicateUser.update(
        {
          email: buildMergedEmailAlias(primary.email, duplicateUser.id),
          isActive: false,
          status: "Anonymised",
          refreshToken: null,
        },
        { transaction }
      );
    }

    await AuditLog.create(
      {
        userId: adminUserId,
        action: "duplicate_users_merged",
        entityType: "user",
        entityId: primary.id,
        notes: `Merged ${duplicateIds.length} duplicate account(s) into user ${primary.id}`,
        newValue: {
          primaryUserId: primary.id,
          duplicateUserIds: duplicateIds,
          email: normalizedEmail,
        },
      },
      { transaction }
    );

    await transaction.commit();
    return res.json({
      success: true,
      data: plan,
      message: "Duplicate users merged successfully",
    });
  } catch (error) {
    await transaction.rollback();
    console.error("mergeDuplicateUsers error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.getPendingIdentityChanges = async (req, res) => {
  try {
    const requests = await NameChangeHistory.findAll({
      where: { status: "pending" },
      include: [
        {
          model: Player,
          as: "player",
          attributes: ["id", "name", "dateOfBirth", "userId"],
          include: [{ model: User, as: "user", attributes: ["id", "email"] }],
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    const mapped = requests.map((r) => {
      const isDob = String(r.oldName || "").startsWith("DOB:") || String(r.newName || "").startsWith("DOB:");
      return {
        id: r.id,
        playerId: r.playerId,
        changeType: isDob ? "dateOfBirth" : "name",
        oldValue: isDob ? String(r.oldName || "").replace(/^DOB:/, "") : r.oldName,
        newValue: isDob ? String(r.newName || "").replace(/^DOB:/, "") : r.newName,
        reason: r.reason,
        createdAt: r.createdAt,
        player: r.player,
      };
    });

    return res.json({ success: true, data: mapped, message: "Pending identity changes retrieved" });
  } catch (error) {
    console.error("getPendingIdentityChanges error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.approveIdentityChange = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { userId: adminUserId } = req.user;
    const { requestId } = req.params;

    const request = await NameChangeHistory.findByPk(requestId, {
      include: [{ model: Player, as: "player" }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!request) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Identity change request not found" });
    }

    if (request.status !== "pending") {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: "Only pending requests can be approved" });
    }

    if (!request.player) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: "Player not found for this request" });
    }

    const isDobChange = String(request.oldName || "").startsWith("DOB:") || String(request.newName || "").startsWith("DOB:");
    if (isDobChange) {
      await request.player.update({ dateOfBirth: String(request.newName || "").replace(/^DOB:/, "") || null }, { transaction });
    } else {
      await request.player.update({ name: request.newName }, { transaction });
    }

    await request.update(
      {
        status: "approved",
        approvedBy: adminUserId,
      },
      { transaction }
    );

    await AuditLog.create(
      {
        userId: adminUserId,
        action: "identity_change_approved",
        entityType: "name_change_history",
        entityId: request.id,
        newValue: {
          playerId: request.playerId,
          oldName: request.oldName,
          newName: request.newName,
        },
      },
      { transaction }
    );

    await transaction.commit();
    return res.json({ success: true, data: request, message: "Identity change approved" });
  } catch (error) {
    await transaction.rollback();
    console.error("approveIdentityChange error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.rejectIdentityChange = async (req, res) => {
  try {
    const { userId: adminUserId } = req.user;
    const { requestId } = req.params;
    const { reason } = req.body;

    const request = await NameChangeHistory.findByPk(requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: "Identity change request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ success: false, error: "Only pending requests can be rejected" });
    }

    await request.update({ status: "rejected", approvedBy: adminUserId, reason: reason || request.reason });

    await AuditLog.create({
      userId: adminUserId,
      action: "identity_change_rejected",
      entityType: "name_change_history",
      entityId: request.id,
      notes: reason || "Rejected by admin",
    });

    return res.json({ success: true, data: request, message: "Identity change rejected" });
  } catch (error) {
    console.error("rejectIdentityChange error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// =====================================================
// Season Management
// =====================================================

// Create new season
exports.createSeason = async (req, res) => {
  try {
    const { userId, role } = req.user;
    let { organizationId, gameId, name, startDate, endDate, description } = req.body;

    // Required fields check
    if (!name || !startDate || !endDate || !gameId) {
      return res.status(400).json({
        success: false,
        error: "Season name, start date, end date, and game ID are required",
      });
    }

    // Verify game exists
    const game = await Game.findByPk(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        error: "Game not found",
      });
    }

    // For non-super admins, get organizationId from their profile
    if (role !== "super_admin") {
      const organization = await Organization.findOne({
        where: { userId },
      });

      if (!organization) {
        return res.status(403).json({
          success: false,
          error: "Organization not found for this user",
        });
      }

      organizationId = organization.id;
    } else if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: "Organization ID is required for super admin",
      });
    }

    // Check unique season name within organization and game
    const existingSeason = await Season.findOne({
      where: {
        organizationId,
        gameId,
        name: name.trim(),
      },
    });

    if (existingSeason) {
      return res.status(400).json({
        success: false,
        error: "Season name already exists for this organization and game",
      });
    }

    // Normalize dates
    const seasonStartDate = new Date(startDate);
    seasonStartDate.setUTCHours(0, 0, 0, 0);

    const seasonEndDate = new Date(endDate);
    seasonEndDate.setUTCHours(0, 0, 0, 0);

    // Date validation
    if (seasonStartDate > seasonEndDate) {
      return res.status(400).json({
        success: false,
        error: "Start date must be before the end date",
      });
    }

    // Check for overlapping active season for the same game
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeSeason = await Season.findOne({
      where: {
        organizationId,
        gameId,
        startDate: { [Op.lte]: today },
        endDate: { [Op.gte]: today },
      },
    });

    // Validate date conflict with running season
    if (activeSeason) {
      if (seasonStartDate < new Date(activeSeason.endDate)) {
        return res.status(400).json({
          success: false,
          error: `A season is already running for this game within this start date. Please select a start date after ${activeSeason.endDate}`,
        });
      }
    }

    // Determine season status
    let status = "upcoming";
    if (seasonStartDate <= today && seasonEndDate >= today) {
      status = "active";
    } else if (seasonEndDate < today) {
      status = "completed";
    }

    // Create new season
    const season = await Season.create({
      organizationId,
      gameId,
      name: name.trim(),
      startDate: seasonStartDate,
      endDate: seasonEndDate,
      description: description || null,
      status,
    });

    // Get full season details with associations
    const fullSeason = await Season.findByPk(season.id, {
      include: [
        { model: Organization, as: "organization", attributes: ["id", "organizationName"] },
        { model: Game, as: "game", attributes: ["id", "name"] },
      ],
    });

    // Get organization details for audit log
    const organization = await Organization.findByPk(organizationId);

    await AuditLog.create({
      userId,
      action: "season_created",
      entityType: "season",
      entityId: season.id,
      newValue: {
        name: season.name,
        gameName: game.name,
        startDate: season.startDate,
        endDate: season.endDate,
        organizationName: organization?.organizationName
      },
    });

    return res.status(201).json({
      success: true,
      data: fullSeason,
      message: "Season created successfully",
    });

  } catch (error) {
    console.error("createSeason error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Get all seasons
exports.getAllSeasons = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { organizationId, status, page = 1, limit = 20 } = req.query;

    const where = {};

    // For non-super admins, get organizationId from their profile
    if (role !== "super_admin") {
      const organization = await Organization.findOne({
        where: { userId },
      });

      if (!organization) {
        return res.status(403).json({
          success: false,
          error: "Organization not found for this user",
        });
      }

      where.organizationId = organization.id;
    } else if (organizationId) {
      where.organizationId = organizationId;
    }

    if (status) {
      where.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows: seasons } = await Season.findAndCountAll({
      where,
      include: [
        {
          model: Organization,
          as: "organization",
          attributes: ["id", "organizationName"]
        },
        {
          model: Game,
          as: "game",
          attributes: ["id", "name"]
        }
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    if (!count) {
      return res.status(200).json({
        success: true,
        data: { seasons: [], pagination: {} },
        message: "No seasons found"
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        seasons,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit),
        },
      },
      message: "Seasons retrieved successfully"
    });

  } catch (error) {
    console.error("getAllSeasons error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// Get season by ID
exports.getSeasonById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { seasonId } = req.params;

    if (!seasonId) {
      return res.status(400).json({
        success: false,
        error: "Season ID is required"
      });
    }

    const season = await Season.findByPk(seasonId, {
      include: [
        {
          model: Organization,
          as: "organization",
          attributes: ["id", "organizationName"]
        },
        {
          model: Game,
          as: "game",
          attributes: ["id", "name"]
        }
      ],
    });

    if (!season) {
      return res.status(404).json({
        success: false,
        error: "Season not found"
      });
    }

    // For non-super admins, check if season belongs to their organization
    if (role !== "super_admin") {
      const organization = await Organization.findOne({
        where: { userId },
      });

      if (!organization || season.organizationId !== organization.id) {
        return res.status(403).json({
          success: false,
          error: "Access denied to this season",
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: season,
      message: "Season retrieved successfully"
    });

  } catch (error) {
    console.error("getSeasonById error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// Edit season
exports.editSeason = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { seasonId } = req.params;
    let { name, endDate, description, status } = req.body;

    if (!seasonId) {
      return res.status(400).json({
        success: false,
        error: "Season ID is required"
      });
    }

    const season = await Season.findByPk(seasonId);

    if (!season) {
      return res.status(404).json({
        success: false,
        error: "Season not found"
      });
    }

    // For non-super admins, check if season belongs to their organization
    if (role !== "super_admin") {
      const organization = await Organization.findOne({
        where: { userId },
      });

      if (!organization || season.organizationId !== organization.id) {
        return res.status(403).json({
          success: false,
          error: "Access denied to this season",
        });
      }
    }

    // Check if season already ended
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (new Date(season.endDate) < today && season.status === "completed") {
      return res.status(400).json({
        success: false,
        error: "Cannot edit a season that has already ended"
      });
    }

    const oldValue = {
      name: season.name,
      endDate: season.endDate,
      status: season.status,
      description: season.description,
    };

    // Update fields
    if (name) season.name = name.trim();
    if (description !== undefined) season.description = description;
    if (status) season.status = status;

    if (endDate) {
      const newEndDate = new Date(endDate);
      newEndDate.setUTCHours(0, 0, 0, 0);

      // Validate endDate
      if (newEndDate < new Date(season.startDate)) {
        return res.status(400).json({
          success: false,
          error: "End date must be after start date"
        });
      }

      season.endDate = newEndDate;
    }

    await season.save();

    // Fetch updated season with associations
    const updatedSeason = await Season.findByPk(seasonId, {
      include: [
        {
          model: Organization,
          as: "organization",
          attributes: ["id", "organizationName"]
        },
        {
          model: Game,
          as: "game",
          attributes: ["id", "name"]
        }
      ],
    });

    await AuditLog.create({
      userId,
      action: "season_updated",
      entityType: "season",
      entityId: seasonId,
      oldValue,
      newValue: {
        name: season.name,
        endDate: season.endDate,
        status: season.status,
        description: season.description,
      },
    });

    return res.status(200).json({
      success: true,
      data: updatedSeason,
      message: "Season updated successfully"
    });

  } catch (error) {
    console.error("editSeason error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// Delete Season
exports.deleteSeason = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { seasonId } = req.params;

    if (!seasonId) {
      return res.status(400).json({
        success: false,
        error: "Season ID is required"
      });
    }

    const season = await Season.findByPk(seasonId);

    if (!season) {
      return res.status(404).json({
        success: false,
        error: "Season not found"
      });
    }

    // For non-super admins, check if season belongs to their organization
    if (role !== "super_admin") {
      const organization = await Organization.findOne({
        where: { userId },
      });

      if (!organization || season.organizationId !== organization.id) {
        return res.status(403).json({
          success: false,
          error: "Access denied to this season",
        });
      }
    }

    // Check if this is the current active season
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (new Date(season.startDate) <= today && new Date(season.endDate) >= today) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete the current active season"
      });
    }

    const deletedSeasonInfo = {
      id: season.id,
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
    };

    await season.destroy();

    await AuditLog.create({
      userId,
      action: "season_deleted",
      entityType: "season",
      entityId: seasonId,
      oldValue: deletedSeasonInfo,
    });

    return res.status(200).json({
      success: true,
      data: null,
      message: "Season deleted successfully"
    });

  } catch (error) {
    console.error("deleteSeason error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// Get current season
exports.getCurrentSeason = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { organizationId } = req.query;

    const where = {};

    // For non-super admins, get organizationId from their profile
    if (role !== "super_admin") {
      const organization = await Organization.findOne({
        where: { userId },
      });

      if (!organization) {
        return res.status(403).json({
          success: false,
          error: "Organization not found for this user",
        });
      }

      where.organizationId = organization.id;
    } else if (organizationId) {
      where.organizationId = organizationId;
    } else {
      return res.status(400).json({
        success: false,
        error: "Organization ID is required for super admin",
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentSeason = await Season.findOne({
      where: {
        ...where,
        startDate: { [Op.lte]: today },
        endDate: { [Op.gte]: today },
      },
      include: [
        {
          model: Organization,
          as: "organization",
          attributes: ["id", "organizationName"]
        },
        {
          model: Game,
          as: "game",
          attributes: ["id", "name"]
        }
      ],
    });

    if (!currentSeason) {
      return res.status(404).json({
        success: false,
        error: "No current active season found"
      });
    }

    return res.status(200).json({
      success: true,
      data: currentSeason,
      message: "Current season retrieved successfully"
    });

  } catch (error) {
    console.error("getCurrentSeason error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// Get all available games
exports.getGames = async (req, res) => {
  try {
    const games = await Game.findAll({
      where: { isActive: true },
      order: [["name", "ASC"]],
    });

    if (!games.length) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No active games found"
      });
    }

    return res.status(200).json({
      success: true,
      data: games,
      message: "Games retrieved successfully"
    });

  } catch (error) {
    console.error("getGames error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};
