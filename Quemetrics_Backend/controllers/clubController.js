const {
  Club,
  ClubMember,
  ClubAnnouncement,
  ClubVenue,
  User,
  Player,
  VenueOwner,
  Organization,
  ClubEmailVerification,
  League,
  Tournament,
  Fixture,
  MatchResult,
  Game,
} = require("../models");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const crypto = require("crypto");
const emailService = require("../utils/email");

// ===========================
// Utility Functions
// ===========================

// Generate URL-friendly slug from club name
function generateSlug(name) {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Add random suffix to ensure uniqueness
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${slug}-${suffix}`;
}

// Generate random join code
function generateJoinCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function parseJoinSettings(raw) {
  let joinSettings = raw;
  if (typeof joinSettings === "string") {
    try {
      joinSettings = JSON.parse(joinSettings);
    } catch {
      joinSettings = {};
    }
  }
  if (!joinSettings || typeof joinSettings !== "object") {
    joinSettings = {};
  }

  const method = ["invite", "code", "open"].includes(joinSettings.method)
    ? joinSettings.method
    : "invite";

  return {
    method,
    requireApproval: !!joinSettings.requireApproval,
    joinCode: joinSettings.joinCode || null,
    codeExpiry: joinSettings.codeExpiry || null,
    invitations: Array.isArray(joinSettings.invitations) ? joinSettings.invitations : [],
  };
}

function joinMethodAllowed(joinSettings, channel) {
  const method = joinSettings.method;
  if (channel === "invitation") return method === "invite";
  if (channel === "code") return method === "code";
  if (channel === "public") return method === "open";
  return false;
}

function resolveMemberJoinStatus(joinSettings) {
  return joinSettings.requireApproval ? "pending" : "active";
}

async function getClubDependencyCounts(clubId) {
  const [memberCount, venueCount, announcementCount, leagueRows, tournamentRows] = await Promise.all([
    ClubMember.count({ where: { clubId, status: { [Op.ne]: "removed" } } }),
    ClubVenue.count({ where: { clubId, status: { [Op.ne]: "inactive" } } }),
    ClubAnnouncement.count({ where: { clubId } }),
    League.findAll({ where: { clubId }, attributes: ["id"] }),
    Tournament.findAll({ where: { clubId }, attributes: ["id"] }),
  ]);

  const leagueIds = leagueRows.map((x) => x.id);
  const tournamentIds = tournamentRows.map((x) => x.id);

  const fixtureWhere = {};
  const resultWhere = {};
  const fixtureOr = [];
  const resultOr = [];
  if (leagueIds.length > 0) {
    fixtureOr.push({ leagueId: { [Op.in]: leagueIds } });
    resultOr.push({ leagueId: { [Op.in]: leagueIds } });
  }
  if (tournamentIds.length > 0) {
    fixtureOr.push({ tournamentId: { [Op.in]: tournamentIds } });
    resultOr.push({ tournamentId: { [Op.in]: tournamentIds } });
  }
  if (fixtureOr.length > 0) fixtureWhere[Op.or] = fixtureOr;
  if (resultOr.length > 0) resultWhere[Op.or] = resultOr;

  const [fixtureCount, resultCount] = await Promise.all([
    fixtureOr.length > 0 ? Fixture.count({ where: fixtureWhere }) : 0,
    resultOr.length > 0 ? MatchResult.count({ where: resultWhere }) : 0,
  ]);

  return {
    memberCount,
    venueCount,
    announcementCount,
    leagueCount: leagueIds.length,
    tournamentCount: tournamentIds.length,
    fixtureCount,
    resultCount,
  };
}

function hasBlockingDependencies(counts) {
  return (
    counts.memberCount > 1 ||
    counts.venueCount > 0 ||
    counts.announcementCount > 0 ||
    counts.leagueCount > 0 ||
    counts.tournamentCount > 0 ||
    counts.fixtureCount > 0 ||
    counts.resultCount > 0
  );
}

async function ensureOrganizerContinuity(clubId) {
  const activeAdminMemberships = await ClubMember.findAll({
    where: { clubId, role: "club_admin", status: "active" },
    include: [{ model: User, as: "user", attributes: ["id", "isActive", "status"], required: false }],
  });

  const validAdminExists = activeAdminMemberships.some((m) => {
    const u = m.user;
    return !!u && u.isActive && !["Suspended", "Anonymised"].includes(u.status);
  });
  if (validAdminExists) return;

  const fallbackCandidates = await ClubMember.findAll({
    where: {
      clubId,
      status: "active",
      role: { [Op.in]: ["assistant_admin", "member"] },
    },
    include: [{ model: User, as: "user", attributes: ["id", "isActive", "status"], required: true }],
    order: [["joinedAt", "ASC"]],
  });

  const candidate = fallbackCandidates.find((m) => m.user && m.user.isActive && !["Suspended", "Anonymised"].includes(m.user.status));
  if (!candidate) return;

  await candidate.update({ role: "club_admin" });
  await Club.update({ createdBy: candidate.userId }, { where: { id: clubId } });
}

// Validate user has admin access to club
async function validateClubAdmin(clubId, userId) {
  const membership = await ClubMember.findOne({
    where: {
      clubId,
      userId,
      role: { [Op.in]: ["club_admin", "assistant_admin"] },
      status: "active",
    },
  });
  return membership;
}

// Check if user owns the organization that owns the club
async function validateOrganizationOwner(clubId, userId) {
  try {
    const club = await Club.findByPk(clubId);
    if (!club || !club.organizationId) {
      return false;
    }

    const organization = await Organization.findByPk(club.organizationId);
    if (!organization) {
      return false;
    }

    return organization.userId === userId;
  } catch (error) {
    console.error("validateOrganizationOwner error:", error);
    return false;
  }
}

// Comprehensive admin check: super_admin, organization owner, or club admin
async function hasClubAdminAccess(clubId, userId, userRole) {
  try {
    await ensureOrganizerContinuity(clubId);

    // Super admin has access to everything
    if (userRole === "super_admin") {
      return true;
    }

    // Check if user owns the organization that owns this club
    const isOrgOwner = await validateOrganizationOwner(clubId, userId);
    if (isOrgOwner) {
      return true;
    }

    // Check if user is a club admin
    const isClubAdmin = await validateClubAdmin(clubId, userId);
    return !!isClubAdmin;
  } catch (error) {
    console.error("hasClubAdminAccess error:", error);
    return false;
  }
}

// Ensure minimum one admin exists
async function ensureMinimumAdmin(clubId, excludeUserId = null) {
  const where = {
    clubId,
    role: "club_admin",
    status: "active",
  };

  if (excludeUserId) {
    where.userId = { [Op.ne]: excludeUserId };
  }

  const adminCount = await ClubMember.count({ where });
  return adminCount >= 1;
}

// ===========================
// Club CRUD Operations
// ===========================

// Create a new club
exports.createClub = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      name,
      email,
      phone,
      address,
      contactPerson,
      gameId,
      sportTypes,
      sportType,
      visibility = "private",
      description,
      // logoUrl
    } = req.body;

    // Combine all sport inputs (gameId, sportType, sportTypes) into one list
    let inputSports = [];
    if (gameId) inputSports.push(...(Array.isArray(gameId) ? gameId : [gameId]));
    if (sportType) inputSports.push(sportType);
    if (sportTypes) inputSports.push(...(Array.isArray(sportTypes) ? sportTypes : [sportTypes]));
    
    // Deduplicate and trim
    inputSports = [...new Set(inputSports.filter(Boolean).map(s => String(s).trim()))];

    const resolvedGameIds = [];
    const resolvedSportNames = [];

    const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

    for (const s of inputSports) {
      const game = isUUID(s) 
        ? await Game.findByPk(s)
        : await Game.findOne({
            where: sequelize.where(
              sequelize.fn('LOWER', sequelize.col('name')),
              s.toLowerCase()
            ),
          });

      if (game) {
        if (!resolvedGameIds.includes(game.id)) resolvedGameIds.push(game.id);
        if (!resolvedSportNames.includes(game.name)) resolvedSportNames.push(game.name);
      } else {
        // Fallback: capitalize manually if not in games table
        const capitalized = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        if (!resolvedSportNames.includes(capitalized)) resolvedSportNames.push(capitalized);
      }
    }

    // Validate required fields
    if (!name || !email || !phone || !address || resolvedSportNames.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Club name, contact email, phone, address, and at least one sport type are required",
      });
    }

    const finalSportTypes = resolvedSportNames;
    const finalGameIds = resolvedGameIds;

    // Validate sport types array
    const validSportTypes = ["snooker", "pool", "pooker"];
    const normalizedSportTypes = finalSportTypes.map(s => s.toLowerCase());
    const invalidSports = normalizedSportTypes.filter(s => !validSportTypes.includes(s));
    if (invalidSports.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid sport types: ${invalidSports.join(', ')}. Must be one of: Snooker, Pool, Pooker`,
      });
    }

    // Validate visibility
    if (!["public", "private"].includes(visibility)) {
      return res.status(400).json({
        success: false,
        error: "Visibility must be 'public' or 'private'",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format",
      });
    }

    // Validate user exists
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Get user's player profile if exists
    const playerProfile = await Player.findOne({ where: { userId } });

    // Get user's organization if exists
    const userOrganization = await Organization.findOne({
      where: { userId },
    });

    // Generate unique slug
    const slug = generateSlug(name);

    // Generate join code for club
    const joinCode = generateJoinCode();
    const codeExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Create club with all required fields
    const club = await Club.create({
      name,
      slug,
      email,
      phone,
      address,
      contactPerson: contactPerson || null,
      gameIds: finalGameIds,
      sportTypes: finalSportTypes,
      description: description || null,
      // logoUrl: logoUrl || null,
      visibility,
      status: "pending",
      joinSettings: {
        method: "invite",
        requireApproval: false,
        joinCode: joinCode,
        codeExpiry: codeExpiry,
      },
      memberCount: 1,
      createdBy: userId,
      organizationId: userOrganization?.id || null,
      isVerified: false,
      verificationNote: "Awaiting email verification from club owner",
    });

    // Ensure the creator has a Player profile; if not, create one and link to this club
    let creatorPlayer = playerProfile;
    if (!creatorPlayer) {
      const defaultName = user.email ? user.email.split('@')[0] : `Player-${userId}`;
      try {
        creatorPlayer = await Player.create({
          userId: user.id,
          name: defaultName,
          organizationId: userOrganization?.id || null,
          clubId: club.id,
          isIndependent: false,
        });
      } catch (pErr) {
        console.error('Failed to create player profile for club creator:', pErr);
      }
    } else {
      // If profile exists but doesn't reference this club, set clubId
      if (!creatorPlayer.clubId) {
        try {
          await creatorPlayer.update({ clubId: club.id });
        } catch (uErr) {
          console.error('Failed to update creator player clubId:', uErr);
        }
      }
    }

    // Create ClubMember record for creator as admin (link to player if available)
    let clubMem;
    try {
      clubMem = await ClubMember.create({
        clubId: club.id,
        userId,
        playerId: creatorPlayer?.id || null,
        role: "club_admin",
        status: "active",
        joinedAt: new Date(),
        joinMethod: "created",
      });
      console.log(`[createClub] ✅ ClubMember created successfully: userId=${userId}, clubId=${club.id}, playerId=${creatorPlayer?.id}, memberId=${clubMem.id}`);
    } catch (cmErr) {
      console.error('[createClub] ❌ ERROR creating ClubMember:', cmErr.message);
      console.error('[createClub] ClubMember error details:', cmErr);
      throw cmErr; // Re-throw so the entire club creation fails if ClubMember fails
    }

    // Generate verification token (expires in 24 hours)
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Save verification token to database
    await ClubEmailVerification.create({
      clubId: club.id,
      email: email,
      token: verificationToken,
      expiresAt: expiresAt,
      used: false,
    });

    // Send verification email
    try {
      const verificationLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/verify-club-email?token=${verificationToken}&clubId=${club.id}`;
      await emailService.sendClubVerificationEmail({
        email: email,
        clubName: name,
        verificationLink: verificationLink,
        verificationToken: verificationToken,
        expiresIn: "24 hours",
      });
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
      // Don't fail the club creation if email fails, but log it
    }

    console.log(`[createClub] ✅ COMPLETE: Club ${club.id} (${name}) created successfully with creator membership`);

    return res.status(201).json({
      success: true,
      data: club,
      message: "Club created successfully. You are now the Club Admin. Verification pending. Check your email to verify the club.",
    });

  } catch (error) {
    console.error("createClub error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
};

// Get all clubs (with filters)
exports.getClubs = async (req, res) => {
  try {
    const { visibility, status, search } = req.query;

    const where = {};

    if (visibility) {
      where.visibility = visibility;
      // Only show verified clubs in the public tab
      if (visibility === "public") {
        where.isVerified = true;
      }
    }

    // Only filter by status if explicitly provided in query
    if (status) {
      where.status = status;
    }

    if (search) {
      where.name = { [Op.like]: `%${search}%` };
    }

    const clubs = await Club.findAll({
      where,
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "email"],
        },
        {
          model: ClubMember,
          as: "members",
          required: false,
          include: [
            { model: Player, as: "player", attributes: ["id", "name", "avatarUrl"] },
            { model: User, as: "user", attributes: ["id", "email"] },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // Build a players array for each club (from ClubMember.player or ClubMember.user)
    const clubsWithPlayers = clubs.map((c) => {
      const clubObj = c.toJSON();
      const members = (clubObj.members || []).map((m) => {
        const base = m.player
          ? { id: m.player.id, name: m.player.name, avatarUrl: m.player.avatarUrl, userId: m.user?.id || null, email: m.user?.email || null }
          : { id: m.user?.id || null, name: m.user?.email || null, userId: m.user?.id || null, email: m.user?.email || null };
        base.membershipId = m.id;
        base.role = m.role;
        base.status = m.status;
        return base;
      });

      // Ensure creator appears in players list
      if (clubObj.creator && clubObj.creator.id) {
        const creatorId = clubObj.creator.id;
        const found = members.find((p) => p.userId === creatorId || p.id === creatorId);
        if (!found) {
          members.unshift({ id: creatorId, name: clubObj.creator.email, userId: creatorId, membershipId: null, role: 'club_admin', status: 'active', email: clubObj.creator.email });
        }
      }

      // Attach players array and remove raw members to keep response tidy
      clubObj.players = members;
      delete clubObj.members;
      return clubObj;
    });

    return res.status(200).json({
      success: true,
      data: clubsWithPlayers,
      message: "Clubs retrieved successfully",
    });
  } catch (error) {
    console.error("getClubs error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Verify/Approve a club (set status to active and isVerified to true)
exports.verifyClub = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId, role } = req.user;
    const { verificationNote } = req.body;

    // Check if club exists
    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({
        success: false,
        error: "Club not found",
      });
    }

    // Check authorization - only super admin or organization owner can verify
    const isOrgOwner = await validateOrganizationOwner(clubId, userId);
    const isSuperAdmin = role === "super_admin";

    if (!isSuperAdmin && !isOrgOwner) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized - only Super Admin or Organization Owner can verify clubs",
      });
    }

    // Update club status to active and mark as verified
    await club.update({
      status: "active",
      isVerified: true,
      verificationNote: verificationNote || "Verified via email confirmation",
    });

    return res.status(200).json({
      success: true,
      data: club,
      message: "Club verified successfully and is now active",
    });
  } catch (error) {
    console.error("verifyClub error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
};

// Reject/Decline a club verification
exports.rejectClub = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId, role } = req.user;
    const { reason } = req.body;

    // Check if club exists
    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({
        success: false,
        error: "Club not found",
      });
    }

    // Check authorization
    const isOrgOwner = await validateOrganizationOwner(clubId, userId);
    const isSuperAdmin = role === "super_admin";

    if (!isSuperAdmin && !isOrgOwner) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized - only Super Admin or Organization Owner can reject clubs",
      });
    }

    // Update club status to suspended and add rejection reason
    await club.update({
      status: "suspended",
      isVerified: false,
      verificationNote: `Verification rejected: ${reason || "Club does not meet verification criteria"}`,
    });

    return res.status(200).json({
      success: true,
      data: club,
      message: "Club verification rejected",
    });
  } catch (error) {
    console.error("rejectClub error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
};

// Get pending clubs for verification
exports.getPendingClubs = async (req, res) => {
  try {
    const { userId, role } = req.user;

    // Only super admin can see all pending clubs
    // Organization owners can see only their organization's pending clubs
    let where = { status: "pending" };

    if (role !== "super_admin") {
      // Get user's organization
      const org = await Organization.findOne({ where: { userId } });
      if (!org) {
        return res.status(200).json({
          success: true,
          data: [],
          message: "No pending clubs to review",
        });
      }
      where.organizationId = org.id;
    }

    const clubs = await Club.findAll({
      where,
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "email"],
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      data: clubs,
      message: "Pending clubs retrieved successfully",
    });
  } catch (error) {
    console.error("getPendingClubs error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
};

// Get clubs where user is a member
exports.getMyClubs = async (req, res) => {
  try {
    const { userId } = req.user;

    console.log(`[getMyClubs] START: Fetching clubs for userId=${userId}`);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "User ID not found in authentication",
      });
    }

    // Step 1: Get all clubIds where user is an active member
    const activeMemberships = await ClubMember.findAll({
      where: { userId, status: "active" },
      attributes: ['clubId', 'role', 'status', 'joinedAt', 'joinMethod'],
    });

    const memberClubIds = activeMemberships.map(m => m.clubId);
    console.log(`[getMyClubs] Active member of ${memberClubIds.length} clubs`);

    // Step 2: Get all clubIds where user is the creator
    const ownedClubs = await Club.findAll({
      where: { createdBy: userId },
      attributes: ['id'],
    });
    const ownedClubIds = ownedClubs.map(c => c.id);
    console.log(`[getMyClubs] Creator of ${ownedClubIds.length} clubs`);

    // Combine all club IDs (union, no duplicates)
    const allClubIds = [...new Set([...memberClubIds, ...ownedClubIds])];
    console.log(`[getMyClubs] Total unique clubs to fetch: ${allClubIds.length}`);

    if (allClubIds.length === 0) {
      console.log(`[getMyClubs] No clubs found for userId=${userId}`);
      return res.status(200).json({
        success: true,
        data: [],
        message: "Your clubs retrieved successfully",
      });
    }

    // Step 3: Fetch full club details for all these club IDs
    const clubs = await Club.findAll({
      where: {
        id: { [Op.in]: allClubIds },
        status: { [Op.in]: ["pending", "active", "archived"] },
      },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "email"],
          required: false,
        },
        {
          model: ClubMember,
          as: "members",
          required: false,
          // NOTE: No 'where' here because adding a where on required:false changes LEFT JOIN to INNER JOIN
          // and would exclude clubs with zero active members. Instead we filter in JS below.
          include: [
            { model: Player, as: "player", attributes: ["id", "name", "avatarUrl"], required: false },
            { model: User, as: "user", attributes: ["id", "email"], required: false },
          ],
        },
      ],
      order: [["name", "ASC"]],
    });

    console.log(`[getMyClubs] Fetched ${clubs.length} clubs (after status filter)`);

    // Build membership lookup for role info
    const membershipMap = {};
    activeMemberships.forEach(m => {
      membershipMap[m.clubId] = m;
    });

    // Format response
    const result = clubs.map((club) => {
      const clubObj = club.toJSON();

      // Build players array (only active members)
      const members = (clubObj.members || [])
        .filter(member => member.status === 'active')
        .map((member) => {
        const base = member.player
          ? { id: member.player.id, name: member.player.name, avatarUrl: member.player.avatarUrl, userId: member.user?.id || null, email: member.user?.email || null }
          : { id: member.user?.id || null, name: member.user?.email || null, userId: member.user?.id || null, email: member.user?.email || null };
        base.membershipId = member.id;
        base.role = member.role;
        base.status = member.status;
        return base;
      });

      // Ensure creator appears in players list
      if (clubObj.creator?.id) {
        const found = members.find(p => p.userId === clubObj.creator.id || p.id === clubObj.creator.id);
        if (!found) {
          members.unshift({ id: clubObj.creator.id, name: clubObj.creator.email, userId: clubObj.creator.id, membershipId: null, role: 'club_admin', status: 'active', email: clubObj.creator.email });
        }
      }

      clubObj.players = members;
      delete clubObj.members;

      // Determine role: use membership record if available, else creator is club_admin
      const membership = membershipMap[clubObj.id];
      const myRole = membership ? membership.role : (clubObj.createdBy === userId ? 'club_admin' : 'member');
      const membershipStatus = membership ? membership.status : 'active';
      const joinedAt = membership ? membership.joinedAt : clubObj.createdAt;

      return {
        ...clubObj,
        myRole,
        membershipStatus,
        joinedAt,
      };
    });

    console.log(`[getMyClubs] Returning ${result.length} clubs to frontend`);

    return res
      .set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      .set('Pragma', 'no-cache')
      .set('Expires', '0')
      .status(200)
      .json({
        success: true,
        data: result,
        message: "Your clubs retrieved successfully",
      });
  } catch (error) {
    console.error("[getMyClubs] ❌ ERROR:", error.message);
    console.error("[getMyClubs] Stack:", error.stack);
    return res.status(500).json({
      success: false,
      error: "Internal server error: " + error.message,
    });
  }
};

// Get membership requests including pending and rejected (for player to see their request status)
exports.getMembershipRequests = async (req, res) => {
  try {
    const { userId } = req.user;

    console.log(`[getMembershipRequests] Fetching membership requests for userId=${userId}`);

    // Fetch all memberships (pending, active, rejected)
    const memberships = await ClubMember.findAll({
      where: {
        userId,
      },
      include: [
        {
          model: Club,
          as: "club",
          attributes: ["id", "name", "slug", "description", "visibility", "status", "logoUrl", "memberCount", "sportTypes", "email", "phone", "address", "createdBy", "createdAt", "updatedAt", "organizationId", "isVerified", "verificationNote"],
          include: [
            {
              model: User,
              as: "creator",
              attributes: ["id", "email"],
            },
          ],
        },
      ],
      order: [["updatedAt", "DESC"]],
    });

    console.log(`[getMembershipRequests] Found ${memberships.length} total memberships for userId=${userId}`);

    // Build response with status information
    const requests = memberships.map((m) => {
      const clubObj = m.club.toJSON();

      // Sanitize status - default to 'pending' if empty
      const sanitizedStatus = m.status && m.status.trim() ? m.status : 'pending';

      return {
        membershipId: m.id,
        clubId: m.club.id,
        clubName: m.club.name,
        clubDescription: m.club.description,
        clubVisibility: m.club.visibility,
        clubStatus: m.club.status,
        membershipStatus: sanitizedStatus, // pending, active, rejected
        role: m.role,
        joinedAt: m.joinedAt,
        updatedAt: m.updatedAt,
        club: clubObj,
      };
    });

    return res.status(200).json({
      success: true,
      data: requests,
      message: "Membership requests retrieved successfully",
    });
  } catch (error) {
    console.error("[getMembershipRequests] ❌ ERROR:", error.message);
    console.error("[getMembershipRequests] Stack:", error.stack);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Get single club by ID or slug
exports.getClubById = async (req, res) => {
  try {
    const { identifier } = req.params;
    const { userId } = req.user;

    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (8-4-4-4-12 hex chars)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUUID = uuidRegex.test(identifier);

    // Support both UUID and slug
    const where = isUUID
      ? { id: identifier }
      : { slug: identifier };

    const club = await Club.findOne({
      where,
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "email"],
        },
        {
          model: ClubMember,
          as: "members",
          where: { status: "active" },
          required: false,
          include: [
            {
              model: User,
              as: "user",
              attributes: ["id", "email"],
            },
            {
              model: Player,
              as: "player",
              attributes: ["id", "name", "avatarUrl"],
            },
          ],
        },
      ],
    });

    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    // Check if user is a member
    const userMembership = await ClubMember.findOne({
      where: {
        clubId: club.id,
        userId,
        status: "active",
      },
    });

    // Check if user owns the organization that owns the club
    const isOrgOwner = await validateOrganizationOwner(club.id, userId);
    const isSuperAdmin = req.user.role === "super_admin";

    // If private club and user is not a member/owner/admin, restrict access
    if (club.visibility === "private" && !userMembership && !isOrgOwner && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: "This is a private club. You must be a member to view details.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...club.toJSON(),
        userRole: userMembership?.role || (isOrgOwner ? "org_owner" : null),
        isAdmin: userMembership?.role === "club_admin" || isOrgOwner,
        isAssistant: userMembership?.role === "assistant_admin",
        isMember: !!userMembership || isOrgOwner,
      },
      message: "Club retrieved successfully",
    });
  } catch (error) {
    console.error("getClubById error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Update club details (admin only)
exports.updateClub = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId, role } = req.user;
    const { name, email, phone, address, contactPerson, gameId, sportType, sportTypes, description, logoUrl, visibility, status } = req.body;

    // Validate admin access
    const hasAccess = await hasClubAdminAccess(clubId, userId, role);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can update club details",
      });
    }

    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    // Check if archived or suspended (only if not changing status)
    if (!status && club.status === "archived") {
      return res.status(403).json({
        success: false,
        error: "Cannot modify archived clubs. Reactivate first.",
      });
    }

    if (!status && club.status === "suspended") {
      return res.status(403).json({
        success: false,
        error: "Cannot modify suspended clubs. Reactivate first.",
      });
    }

    // Validate email if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: "Invalid email format",
        });
      }
      club.email = email;
    }

    // Update sports and gameIds
    if (sportTypes || sportType || gameId) {
      let inputSports = [];
      if (gameId) inputSports.push(...(Array.isArray(gameId) ? gameId : [gameId]));
      if (sportType) inputSports.push(sportType);
      if (sportTypes) inputSports.push(...(Array.isArray(sportTypes) ? sportTypes : [sportTypes]));
      
      inputSports = [...new Set(inputSports.filter(Boolean).map(s => String(s).trim()))];

      if (inputSports.length > 0) {
        const resolvedGameIds = [];
        const resolvedSportNames = [];
        const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

        for (const s of inputSports) {
          const game = isUUID(s) 
            ? await Game.findByPk(s)
            : await Game.findOne({
                where: sequelize.where(
                  sequelize.fn('LOWER', sequelize.col('name')),
                  s.toLowerCase()
                ),
              });

          if (game) {
            if (!resolvedGameIds.includes(game.id)) resolvedGameIds.push(game.id);
            if (!resolvedSportNames.includes(game.name)) resolvedSportNames.push(game.name);
          } else {
            const capitalized = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
            if (!resolvedSportNames.includes(capitalized)) resolvedSportNames.push(capitalized);
          }
        }

        club.gameIds = resolvedGameIds;
        club.sportTypes = resolvedSportNames;
      }
    }

    // Update other fields
    if (name) club.name = name;
    if (phone) club.phone = phone;
    if (address) club.address = address;
    if (contactPerson !== undefined) club.contactPerson = contactPerson;
    if (description !== undefined) club.description = description;
    if (logoUrl !== undefined) club.logoUrl = logoUrl;
    if (visibility && ["public", "private"].includes(visibility)) {
      club.visibility = visibility;
    }

    // Update status if provided (for Archive/Suspend/Reactivate)
    if (status && ["active", "archived", "suspended"].includes(status)) {
      club.status = status;
    }

    await club.save();

    return res.status(200).json({
      success: true,
      data: club,
      message: "Club updated successfully",
    });
  } catch (error) {
    console.error("updateClub error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Archive club (soft delete, preserves history)
exports.archiveClub = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId } = req.user;

    // Validate admin access
    const membership = await ClubMember.findOne({
      where: {
        clubId,
        userId,
        role: "club_admin",
        status: "active",
      },
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can archive clubs",
      });
    }

    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    if (club.status === "archived") {
      return res.status(400).json({
        success: false,
        error: "Club is already archived",
      });
    }

    const dependencyCounts = await getClubDependencyCounts(clubId);
    if (hasBlockingDependencies(dependencyCounts)) {
      return res.status(403).json({
        success: false,
        error: "Cannot archive club while dependent entities exist. Resolve linked members/venues/competitions first.",
        data: dependencyCounts,
      });
    }

    // Archive club (read-only, preserves all data)
    club.status = "archived";
    await club.save();

    return res.status(200).json({
      success: true,
      data: club,
      message: "Club archived successfully. All historical data is preserved.",
    });
  } catch (error) {
    console.error("archiveClub error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Suspend club (admin restricted access)
exports.suspendClub = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId } = req.user;

    // Validate admin access
    const membership = await ClubMember.findOne({
      where: {
        clubId,
        userId,
        role: "club_admin",
        status: "active",
      },
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can suspend clubs",
      });
    }

    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    club.status = "suspended";
    await club.save();

    return res.status(200).json({
      success: true,
      data: club,
      message: "Club suspended successfully",
    });
  } catch (error) {
    console.error("suspendClub error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Reactivate club
exports.reactivateClub = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId } = req.user;

    // Validate admin access
    const membership = await ClubMember.findOne({
      where: {
        clubId,
        userId,
        role: "club_admin",
        status: "active",
      },
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can reactivate clubs",
      });
    }

    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    if (club.status === "active") {
      return res.status(400).json({
        success: false,
        error: "Club is already active",
      });
    }

    club.status = "active";
    await club.save();

    return res.status(200).json({
      success: true,
      data: club,
      message: "Club reactivated successfully",
    });
  } catch (error) {
    console.error("reactivateClub error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Update join settings
exports.updateJoinSettings = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId, role } = req.user;
    const { method, requireApproval, generateCode } = req.body;

    // Validate admin access
    const hasAccess = await hasClubAdminAccess(clubId, userId, role);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can update join settings",
      });
    }

    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    let joinSettings = parseJoinSettings(club.joinSettings);

    if (method) {
      if (!["invite", "code", "open"].includes(method)) {
        return res.status(400).json({
          success: false,
          error: "Invalid join method. Must be 'invite', 'code', or 'open'",
        });
      }
      joinSettings.method = method;

      // Keep semantics explicit: open/code can auto-join; invite defaults to approval flow.
      if (method === "invite" && requireApproval === undefined) {
        joinSettings.requireApproval = true;
      }
    }

    if (requireApproval !== undefined) {
      joinSettings.requireApproval = requireApproval;
    }

    if (method === "code" && generateCode) {
      joinSettings.joinCode = generateJoinCode();
      // Set expiry to 30 days from now
      joinSettings.codeExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    club.joinSettings = joinSettings;
    await club.save();

    return res.status(200).json({
      success: true,
      data: club,
      message: "Join settings updated successfully",
    });
  } catch (error) {
    console.error("updateJoinSettings error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Check if club can be deleted (no verified matches/leagues/data)
exports.canDeleteClub = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId, role } = req.user;

    // Validate admin access
    const hasAccess = await hasClubAdminAccess(clubId, userId, role);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can check deletion eligibility",
      });
    }

    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    const dependencyCounts = await getClubDependencyCounts(clubId);
    const hasData = hasBlockingDependencies(dependencyCounts);

    if (hasData) {
      return res.status(200).json({
        success: true,
        canDelete: false,
        reason: "Club has dependent data and cannot be deleted or archived.",
        data: dependencyCounts,
      });
    }

    return res.status(200).json({
      success: true,
      canDelete: true,
      reason: "Club is a test club with zero data and can be deleted by Super Admin.",
      data: dependencyCounts,
    });
  } catch (error) {
    console.error("canDeleteClub error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Delete club (Super Admin or Organization Owner only, for test clubs with zero data)
exports.deleteClub = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId, role } = req.user;

    // Validate admin access
    const hasAccess = await hasClubAdminAccess(clubId, userId, role);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Only Super Admin or Organization Owner can permanently delete clubs",
      });
    }

    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    const dependencyCounts = await getClubDependencyCounts(clubId);
    if (hasBlockingDependencies(dependencyCounts)) {
      return res.status(403).json({
        success: false,
        error: "Cannot delete club with verified matches, leagues, or historical data. Use archive instead.",
        data: dependencyCounts,
      });
    }

    // Permanent deletion (only for test clubs)
    await club.destroy();

    return res.status(200).json({
      success: true,
      message: "Club permanently deleted",
    });
  } catch (error) {
    console.error("deleteClub error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Generate invitation link for club
exports.generateInvitationLink = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId, role } = req.user;
    const { expiryDays = 7 } = req.body;

    // Validate admin access
    const hasAccess = await hasClubAdminAccess(clubId, userId, role);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can generate invitation links",
      });
    }

    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    // Generate unique invitation token
    const invitationToken = crypto.randomBytes(32).toString("hex");
    const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    // Store invitation token in join settings
    // Properly parse joinSettings - it might come from DB as string or object
    let joinSettings = club.joinSettings;

    if (typeof joinSettings === 'string') {
      try {
        joinSettings = JSON.parse(joinSettings);
      } catch (e) {
        joinSettings = {};
      }
    }

    if (!joinSettings) {
      joinSettings = {
        method: "invite",
        requireApproval: false,
      };
    }

    if (!joinSettings.invitations) {
      joinSettings.invitations = [];
    }

    // Ensure invitations is an array
    if (!Array.isArray(joinSettings.invitations)) {
      joinSettings.invitations = [];
    }

    joinSettings.invitations.push({
      token: invitationToken,
      createdBy: userId,
      expiresAt: expiryDate,
      usedCount: 0,
    });

    // Generate join code if it doesn't exist
    if (!joinSettings.joinCode) {
      joinSettings.joinCode = generateJoinCode();
      // Set expiry to 30 days from now
      joinSettings.codeExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    club.joinSettings = joinSettings;
    await club.save();

    // Generate invitation URL (adjust base URL as needed)
    const invitationUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/club/join/${invitationToken}`;

    // Get join code
    const joinCode = joinSettings.joinCode;

    return res.status(200).json({
      success: true,
      data: {
        invitationUrl,
        inviteLink: invitationUrl,
        token: invitationToken,
        expiresAt: expiryDate,
        clubName: club.name,
        joinCode: joinCode,
      },
      message: "Invitation link generated successfully",
    });
  } catch (error) {
    console.error("generateInvitationLink error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Verify club (Super Admin only)
exports.verifyClub = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { role } = req.user;
    const { isVerified, verificationNote } = req.body;

    // Only super admin can verify clubs
    if (role !== "super_admin") {
      return res.status(403).json({
        success: false,
        error: "Only Super Admin can verify clubs",
      });
    }

    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    club.isVerified = isVerified !== undefined ? isVerified : true;
    club.verificationNote = verificationNote || null;
    await club.save();

    return res.status(200).json({
      success: true,
      data: club,
      message: `Club ${isVerified ? "verified" : "unverified"} successfully`,
    });
  } catch (error) {
    console.error("verifyClub error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Verify club email token (PUBLIC endpoint - no authentication required)
exports.verifyClubEmail = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { token } = req.body;

    console.log('===== Club Email Verification Request =====');
    console.log('Club ID:', clubId);
    console.log('Token:', token ? token.substring(0, 16) + '...' : 'MISSING');
    console.log('Token Length:', token ? token.length : 0);

    if (!token) {
      console.log('❌ Verification failed: No token provided');
      return res.status(400).json({
        success: false,
        error: "Verification token is required",
      });
    }

    // Find the email verification record
    console.log('Looking for verification record in database...');
    const verification = await ClubEmailVerification.findOne({
      where: {
        clubId,
        token,
      },
    });

    if (!verification) {
      console.log('❌ Verification failed: Token not found in database');
      console.log('Searched for:', { clubId, token: token.substring(0, 16) + '...' });

      // Debug: Check if there are ANY tokens for this club
      const allTokens = await ClubEmailVerification.findAll({
        where: { clubId },
        attributes: ['id', 'token', 'used', 'expiresAt', 'createdAt'],
      });
      console.log('Available tokens for this club:', allTokens.length);
      allTokens.forEach((t, i) => {
        console.log(`  Token ${i+1}: ${t.token.substring(0, 16)}... (used: ${t.used}, expires: ${t.expiresAt}, created: ${t.createdAt})`);
      });

      // Check if club exists at all
      const club = await Club.findByPk(clubId);
      if (!club) {
        console.log('❌ Club ID not found in database');
        return res.status(404).json({
          success: false,
          error: "Club not found. Please check the verification link.",
        });
      }

      console.log('ℹ Club exists but token not found. Suggesting resend.');
      return res.status(404).json({
        success: false,
        error: "Invalid verification token. The token may have expired or been used already.",
        clubId: clubId,
        suggestResend: true,
        message: "Please request a new verification email.",
      });
    }

    console.log('✓ Verification record found');
    console.log('  ID:', verification.id);
    console.log('  Used:', verification.used);
    console.log('  Expires at:', verification.expiresAt);
    console.log('  Created at:', verification.createdAt);

    // Check if token is already used
    if (verification.used) {
      console.log('❌ Verification failed: Token already used');
      console.log('  Used at:', verification.usedAt);
      console.log('  Verified at:', verification.verifiedAt);
      return res.status(400).json({
        success: false,
        error: "This verification token has already been used. Your club should already be verified.",
        suggestResend: true,
      });
    }

    // Check if token is expired
    const now = new Date();
    if (now > verification.expiresAt) {
      console.log('❌ Verification failed: Token expired');
      console.log('  Current time:', now);
      console.log('  Expiry time:', verification.expiresAt);
      console.log('  Time difference:', (verification.expiresAt - now) / 1000, 'seconds');
      return res.status(400).json({
        success: false,
        error: "Verification token has expired. Please request a new one.",
        clubId: clubId,
        suggestResend: true,
      });
    }

    console.log('✓ Token is valid');

    // Find the club
    console.log('Finding club...');
    const club = await Club.findByPk(clubId);
    if (!club) {
      console.log('❌ Verification failed: Club not found');
      return res.status(404).json({
        success: false,
        error: "Club not found",
      });
    }

    console.log('✓ Club found:', club.name);
    console.log('  Current status:', club.status);
    console.log('  Current verified:', club.isVerified);

    // Update club status to active and mark as verified
    club.status = "active";
    club.isVerified = true;
    club.verificationNote = "Email verified";
    await club.save();

    console.log('✓ Club updated to active');

    // Mark the token as used
    verification.used = true;
    verification.usedAt = new Date();
    verification.verifiedAt = new Date();
    await verification.save();

    console.log('✓ Token marked as used');
    console.log('===== Verification Complete =====\n');

    return res.status(200).json({
      success: true,
      data: club,
      message: "Club email verified successfully! Your club is now active.",
    });
  } catch (error) {
    console.error("❌ verifyClubEmail error:", error.message);
    console.error("Full error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
};

// Resend club email verification (PUBLIC endpoint - creates new token)
exports.resendClubVerificationEmail = async (req, res) => {
  try {
    const { clubId } = req.params;

    console.log('===== Resend Club Email Verification =====');
    console.log('Club ID:', clubId);

    if (!clubId) {
      return res.status(400).json({
        success: false,
        error: "Club ID is required",
      });
    }

    // Find the club
    const club = await Club.findByPk(clubId);
    if (!club) {
      console.log('❌ Club not found:', clubId);
      return res.status(404).json({
        success: false,
        error: "Club not found",
      });
    }

    console.log('✓ Club found:', club.name);
    console.log('  Email:', club.email);
    console.log('  Current status:', club.status);

    // Delete old unused tokens for this club
    const deletedCount = await ClubEmailVerification.destroy({
      where: {
        clubId: clubId,
        used: false
      }
    });
    console.log(`Deleted ${deletedCount} old unused verification tokens`);

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Save new verification token
    const newVerification = await ClubEmailVerification.create({
      clubId: club.id,
      email: club.email,
      token: verificationToken,
      expiresAt: expiresAt,
      used: false,
    });

    console.log('✓ New verification token created');
    console.log('  Token:', verificationToken.substring(0, 16) + '...');
    console.log('  Expires at:', expiresAt);

    // Send verification email
    try {
      const verificationLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/verify-club-email?token=${verificationToken}&clubId=${club.id}`;
      await emailService.sendClubVerificationEmail({
        email: club.email,
        clubName: club.name,
        verificationLink: verificationLink,
        verificationToken: verificationToken,
        expiresIn: "24 hours",
      });
      console.log('✓ Verification email sent to:', club.email);
    } catch (emailError) {
      console.error("❌ Failed to send verification email:", emailError.message);
      // Still return success since the token was created, email might work later
    }

    console.log('===== Resend Complete =====\n');

    return res.status(200).json({
      success: true,
      message: "Verification email resent successfully. Please check your email for the verification link.",
      email: club.email,
    });
  } catch (error) {
    console.error("❌ resendClubVerificationEmail error:", error.message);
    console.error(error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
};

// Validate invitation token and get club info (PUBLIC)
exports.validateInvitationToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Invitation token is required",
      });
    }

    // Find club with this invitation token in joinSettings
    const clubs = await Club.findAll();
    let foundClub = null;
    let invitation = null;

    for (const club of clubs) {
      let joinSettings = club.joinSettings;

      // Parse joinSettings if it's a string
      if (typeof joinSettings === 'string') {
        try {
          joinSettings = JSON.parse(joinSettings);
        } catch (e) {
          continue;
        }
      }

      // Check if token exists in invitations array
      if (joinSettings && joinSettings.invitations && Array.isArray(joinSettings.invitations)) {
        invitation = joinSettings.invitations.find(inv => inv.token === token);
        if (invitation) {
          foundClub = club;
          break;
        }
      }
    }

    if (!foundClub || !invitation) {
      return res.status(404).json({
        success: false,
        error: "Invalid invitation token",
      });
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(invitation.expiresAt);
    if (now > expiresAt) {
      return res.status(400).json({
        success: false,
        error: "Invitation link has expired",
      });
    }

    // Check if club is active
    if (foundClub.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: "This club is not currently accepting members",
      });
    }

    const joinSettings = parseJoinSettings(foundClub.joinSettings);
    if (!joinMethodAllowed(joinSettings, "invitation")) {
      return res.status(403).json({
        success: false,
        error: "Invitation joining is currently disabled for this club",
      });
    }

    // Parse sportTypes if it's a string
    let sportTypes = foundClub.sportTypes;
    if (typeof sportTypes === 'string') {
      try {
        sportTypes = JSON.parse(sportTypes);
      } catch (e) {
        sportTypes = foundClub.sportType ? [foundClub.sportType] : [];
      }
    }

    // Return club info
    return res.status(200).json({
      success: true,
      data: {
        clubId: foundClub.id,
        clubName: foundClub.name,
        description: foundClub.description,
        logoUrl: foundClub.logoUrl,
        sportTypes: sportTypes,
        address: foundClub.address,
        memberCount: foundClub.memberCount,
        visibility: foundClub.visibility,
      },
      message: "Invitation token is valid",
    });
  } catch (error) {
    console.error("validateInvitationToken error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Join club via invitation token
exports.joinViaInvitation = async (req, res) => {
  try {
    const { token } = req.params;
    const { userId } = req.user;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Invitation token is required",
      });
    }

    // Validate user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get user's player profile
    const playerProfile = await Player.findOne({ where: { userId } });

    // Find club with this invitation token
    const clubs = await Club.findAll();
    let foundClub = null;
    let invitation = null;

    for (const club of clubs) {
      let joinSettings = club.joinSettings;

      // Parse joinSettings if it's a string
      if (typeof joinSettings === 'string') {
        try {
          joinSettings = JSON.parse(joinSettings);
        } catch (e) {
          continue;
        }
      }

      // Check if token exists in invitations array
      if (joinSettings && joinSettings.invitations && Array.isArray(joinSettings.invitations)) {
        invitation = joinSettings.invitations.find(inv => inv.token === token);
        if (invitation) {
          foundClub = club;
          break;
        }
      }
    }

    if (!foundClub || !invitation) {
      return res.status(404).json({
        success: false,
        error: "Invalid invitation token",
      });
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(invitation.expiresAt);
    if (now > expiresAt) {
      return res.status(400).json({
        success: false,
        error: "Invitation link has expired",
      });
    }

    // Check if club is active
    if (foundClub.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: "This club is not currently accepting members",
      });
    }

    // Re-parse joinSettings in the outer scope. The `joinSettings` declared
    // inside the for-loop above is block-scoped and gone by the time we get
    // here, so we need a fresh, mutable object for the membership-status
    // check below and the invitation-usage write further down.
    const joinSettings = parseJoinSettings(foundClub.joinSettings);

    // Look up any existing ClubMember row for this (clubId, userId). The
    // remove-member flow soft-deletes by setting status='removed', so a
    // previously-kicked player will have a row here even though they're not
    // an active member. We branch on the row's status:
    //   - active            → genuinely already in, block
    //   - pending           → request already in flight, surface that
    //   - removed/rejected  → previously left/kicked, resurrect this row
    //                         instead of inserting a duplicate so FK history
    //                         (matches, rankings, withdrawals) stays linked
    //   - no row            → fresh join, create as before
    const existingMember = await ClubMember.findOne({
      where: {
        clubId: foundClub.id,
        userId: userId,
      },
    });

    if (existingMember) {
      if (existingMember.status === 'active') {
        return res.status(400).json({
          success: false,
          error: "You are already a member of this club",
        });
      }
      if (existingMember.status === 'pending') {
        return res.status(400).json({
          success: false,
          error: "Your join request is already pending approval",
        });
      }
      // Anything else (removed / rejected / future terminal states) → resurrect below.
    }

    const membershipStatus = resolveMemberJoinStatus(joinSettings);

    let member;
    if (existingMember) {
      // Resurrect the soft-deleted row. Reaching here means status is NOT
      // 'active' or 'pending' (those branches returned above), so bumping
      // memberCount when the new status is 'active' is always correct.
      existingMember.status = membershipStatus;
      existingMember.joinMethod = 'invited';
      existingMember.invitedBy = invitation.createdBy;
      existingMember.playerId = playerProfile?.id || existingMember.playerId;
      await existingMember.save();
      member = existingMember;
    } else {
      member = await ClubMember.create({
        clubId: foundClub.id,
        userId: userId,
        playerId: playerProfile?.id || null,
        role: 'member',
        status: membershipStatus,
        joinMethod: 'invited',
        invitedBy: invitation.createdBy,
      });
    }

    if (membershipStatus === "active") {
      foundClub.memberCount = (foundClub.memberCount || 0) + 1;
    }

    // Increment invitation used count
    const invIndex = joinSettings.invitations.findIndex(inv => inv.token === token);
    if (invIndex !== -1) {
      joinSettings.invitations[invIndex].usedCount = (joinSettings.invitations[invIndex].usedCount || 0) + 1;
    }

    foundClub.joinSettings = joinSettings;
    await foundClub.save();

    return res.status(200).json({
      success: true,
      data: {
        member,
        club: {
          id: foundClub.id,
          name: foundClub.name,
          description: foundClub.description,
          logoUrl: foundClub.logoUrl,
        },
      },
      message: membershipStatus === "active"
        ? `Successfully joined ${foundClub.name}!`
        : `Join request submitted for ${foundClub.name}. Awaiting approval.`,
    });
  } catch (error) {
    console.error("joinViaInvitation error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Validate join code and return club info (PUBLIC - no auth required)
exports.validateJoinCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({
        success: false,
        error: "Join code is required",
      });
    }

    // Find club with this join code
    const clubs = await Club.findAll({
      where: {
        status: 'active', // Only active clubs
        visibility: 'private' // Only private clubs have join codes
      }
    });

    let foundClub = null;

    for (const club of clubs) {
      let joinSettings = club.joinSettings;

      // Parse joinSettings if it's a string
      if (typeof joinSettings === 'string') {
        try {
          joinSettings = JSON.parse(joinSettings);
        } catch (e) {
          continue;
        }
      }

      // Check if join code matches
      if (joinSettings && joinSettings.joinCode === code.toUpperCase()) {
        // Check if code has expired
        if (joinSettings.codeExpiry) {
          const expiryDate = new Date(joinSettings.codeExpiry);
          const now = new Date();
          if (now > expiryDate) {
            return res.status(400).json({
              success: false,
              error: "This join code has expired",
            });
          }
        }

        foundClub = club;
        break;
      }
    }

    if (!foundClub) {
      return res.status(404).json({
        success: false,
        error: "Invalid join code. Please check and try again.",
      });
    }

    // Parse sportTypes if needed
    let sportTypes = foundClub.sportTypes;
    if (typeof sportTypes === 'string') {
      try {
        sportTypes = JSON.parse(sportTypes);
      } catch (e) {
        sportTypes = foundClub.sportType ? [foundClub.sportType] : [];
      }
    }

    // Return club info
    return res.status(200).json({
      success: true,
      data: {
        id: foundClub.id,
        name: foundClub.name,
        description: foundClub.description,
        logoUrl: foundClub.logoUrl,
        sportTypes: sportTypes,
        memberCount: foundClub.memberCount || 0,
        address: foundClub.contactAddress,
        city: foundClub.city,
        state: foundClub.state,
        country: foundClub.country,
      },
      message: "Club found successfully",
    });
  } catch (error) {
    console.error("validateJoinCode error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Join club by join code (requires authentication)
exports.joinByCode = async (req, res) => {
  try {
    const { code } = req.body;
    const { userId } = req.user;

    if (!code || !code.trim()) {
      return res.status(400).json({
        success: false,
        error: "Join code is required",
      });
    }

    // Validate user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get user's player profile
    const playerProfile = await Player.findOne({ where: { userId } });

    // Find club with this join code
    const clubs = await Club.findAll({
      where: {
        status: 'active',
        visibility: 'private'
      }
    });

    let foundClub = null;

    for (const club of clubs) {
      let joinSettings = club.joinSettings;

      // Parse joinSettings if it's a string
      if (typeof joinSettings === 'string') {
        try {
          joinSettings = JSON.parse(joinSettings);
        } catch (e) {
          continue;
        }
      }

      // Check if join code matches
      if (joinSettings && joinSettings.joinCode === code.toUpperCase()) {
        // Check if code has expired
        if (joinSettings.codeExpiry) {
          const expiryDate = new Date(joinSettings.codeExpiry);
          const now = new Date();
          if (now > expiryDate) {
            return res.status(400).json({
              success: false,
              error: "This join code has expired",
            });
          }
        }

        foundClub = club;
        break;
      }
    }

    if (!foundClub) {
      return res.status(404).json({
        success: false,
        error: "Invalid join code",
      });
    }

    const joinSettings = parseJoinSettings(foundClub.joinSettings);
    // Accept code-join when EITHER the club explicitly opted into code-as-method
    // OR the code matches a server-issued joinCode on the club. The code itself
    // is proof of authorisation (org admin shared it), and join codes are also
    // generated as a side effect of invitation-link creation, so gating purely
    // on `method === 'code'` would reject codes the system itself handed out.
    const codeMatchesStoredCode =
      !!joinSettings.joinCode &&
      String(joinSettings.joinCode).toUpperCase() === String(code).toUpperCase();
    if (!joinMethodAllowed(joinSettings, "code") && !codeMatchesStoredCode) {
      return res.status(403).json({
        success: false,
        error: "Join by code is currently disabled for this club",
      });
    }

    // Look up any existing ClubMember row. Soft-deleted rows (status='removed')
    // and previously-rejected rows are eligible to be resurrected rather than
    // duplicated — same pattern as joinViaInvitation.
    const existingMember = await ClubMember.findOne({
      where: {
        clubId: foundClub.id,
        userId: userId,
      },
    });

    if (existingMember) {
      if (existingMember.status === 'active') {
        return res.status(400).json({
          success: false,
          error: "You are already a member of this club",
        });
      }
      if (existingMember.status === 'pending') {
        return res.status(400).json({
          success: false,
          error: "Your join request is already pending approval",
        });
      }
      // Otherwise (removed / rejected / etc) → resurrect below.
    }

    const membershipStatus = resolveMemberJoinStatus(joinSettings);

    let member;
    if (existingMember) {
      existingMember.status = membershipStatus;
      existingMember.joinMethod = 'code';
      existingMember.playerId = playerProfile?.id || existingMember.playerId;
      await existingMember.save();
      member = existingMember;
    } else {
      member = await ClubMember.create({
        clubId: foundClub.id,
        userId: userId,
        playerId: playerProfile?.id || null,
        role: 'member',
        status: membershipStatus,
        joinMethod: 'code',
      });
    }

    if (membershipStatus === "active") {
      foundClub.memberCount = (foundClub.memberCount || 0) + 1;
      await foundClub.save();
    }

    // Parse sportTypes for response
    let sportTypes = foundClub.sportTypes;
    if (typeof sportTypes === 'string') {
      try {
        sportTypes = JSON.parse(sportTypes);
      } catch (e) {
        sportTypes = foundClub.sportType ? [foundClub.sportType] : [];
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        member,
        club: {
          id: foundClub.id,
          name: foundClub.name,
          description: foundClub.description,
          logoUrl: foundClub.logoUrl,
          sportTypes: sportTypes,
        },
      },
      message: membershipStatus === "active"
        ? `Successfully joined ${foundClub.name}!`
        : `Join request submitted for ${foundClub.name}. Awaiting approval.`,
    });
  } catch (error) {
    console.error("joinByCode error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Join public club (requires authentication)
exports.joinPublicClub = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId } = req.user;



    if (!clubId) {
      return res.status(400).json({
        success: false,
        error: "Club ID is required",
      });
    }

    // Validate user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get user's player profile
    const playerProfile = await Player.findOne({ where: { userId } });

    // Find the club
    const club = await Club.findByPk(clubId);

    if (!club) {
      return res.status(404).json({
        success: false,
        error: "Club not found",
      });
    }

    // Verify club is public and active
    if (club.visibility !== 'public') {
      return res.status(400).json({
        success: false,
        error: "This club is private. Please use a join code.",
      });
    }

    if (club.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: "This club is not currently accepting members",
      });
    }

    const joinSettings = parseJoinSettings(club.joinSettings);
    if (!joinMethodAllowed(joinSettings, "public")) {
      return res.status(403).json({
        success: false,
        error: "Public joining is currently disabled for this club",
      });
    }

    const membershipStatus = resolveMemberJoinStatus(joinSettings);

    // Check if user already has a membership record
    const existingMember = await ClubMember.findOne({
      where: {
        clubId: club.id,
        userId: userId,
      },
    });

    if (existingMember) {
      // 'rejected' (admin denied a prior request) and 'removed' (admin kicked
      // the player from the club) are both terminal states the player can
      // re-apply from. Resurrect the existing row so FK history stays linked.
      if (existingMember.status === 'rejected' || existingMember.status === 'removed') {
        existingMember.status = membershipStatus;
        existingMember.joinMethod = 'public';
        existingMember.playerId = playerProfile?.id || existingMember.playerId;
        await existingMember.save();

        if (membershipStatus === "active") {
          club.memberCount = (club.memberCount || 0) + 1;
          await club.save();
        }

        return res.status(200).json({
          success: true,
          data: { member: existingMember, club: { id: club.id, name: club.name } },
          message: membershipStatus === "active"
            ? `Successfully rejoined ${club.name}!`
            : `Your request to rejoin ${club.name} has been submitted!`,
        });
      }

      return res.status(400).json({
        success: false,
        error: existingMember.status === 'pending'
          ? 'Your join request is already pending approval'
          : 'You are already a member of this club',
      });
    }

    // Create a fresh membership honoring approval settings
    const member = await ClubMember.create({
      clubId: club.id,
      userId: userId,
      playerId: playerProfile?.id || null,
      role: 'member',
      status: membershipStatus,
      joinMethod: 'public',
    });

    if (membershipStatus === "active") {
      club.memberCount = (club.memberCount || 0) + 1;
      await club.save();
    }

    // Parse sportTypes for response
    let sportTypes = club.sportTypes;
    if (typeof sportTypes === 'string') {
      try {
        sportTypes = JSON.parse(sportTypes);
      } catch (e) {
        sportTypes = club.sportType ? [club.sportType] : [];
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        member,
        club: {
          id: club.id,
          name: club.name,
          description: club.description,
          logoUrl: club.logoUrl,
          sportTypes: sportTypes,
        },
      },
      message: membershipStatus === "active"
        ? `Successfully joined ${club.name}!`
        : `Join request submitted for ${club.name}. Awaiting approval.`,
    });
  } catch (error) {
    console.error("joinPublicClub error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
