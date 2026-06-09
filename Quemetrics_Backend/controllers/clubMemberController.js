const { Club, ClubMember, User, Player, Organization } = require("../models");
const { Op } = require("sequelize");

// ===========================
// Utility Functions
// ===========================

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
// Member Management
// ===========================

// Get club members
exports.getClubMembers = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId } = req.user;
    const { status, role } = req.query;

    console.log(`[getClubMembers] START: clubId=${clubId}, userId=${userId}, query status=${status}`);

    // Verify user is a member of this club
    const userMembership = await ClubMember.findOne({
      where: {
        clubId,
        userId,
        status: "active",
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        success: false,
        error: "You must be a club member to view members",
      });
    }

    const where = { clubId };

    // Only filter by status if explicitly provided in query params
    if (status !== undefined && status !== null && status !== '') {
      console.log(`[getClubMembers] Filtering by explicit status: ${status}`);
      where.status = status;
    } else {
      // Whitelist approach: only show active and pending members.
      // This excludes 'rejected', 'removed', 'suspended', and legacy '' records.
      console.log(`[getClubMembers] Showing only active & pending members (default)`);
      where.status = { [Op.in]: ["active", "pending"] };
    }

    if (role) {
      where.role = role;
    }

    const members = await ClubMember.findAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "email", "isActive"],
        },
        {
          model: Player,
          as: "player",
          attributes: ["id", "name", "nickname", "avatarUrl"],
        },
      ],
      order: [
        ["role", "ASC"], // Admins first
        ["joinedAt", "ASC"],
      ],
    });

    console.log(`[getClubMembers] Returning ${members.length} members (excluded rejected)`);
    members.forEach(m => {
      console.log(`  - ${m.user?.email}: status=${m.status || '(empty)'}, role=${m.role}`);
    });

    return res
      .set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      .set('Pragma', 'no-cache')
      .set('Expires', '0')
      .status(200)
      .json({
        success: true,
        data: members,
        message: "Club members retrieved successfully",
      });
  } catch (error) {
    console.error("getClubMembers error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Invite member to club
exports.inviteMember = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId: inviterId, role: inviterRole } = req.user;
    const { userEmail, userId: inviteeUserId, role = "member" } = req.body;

    // Validate admin access
    const hasAccess = await hasClubAdminAccess(clubId, inviterId, inviterRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can invite members",
      });
    }

    // Get club
    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    if (club.status !== "active") {
      return res.status(403).json({
        success: false,
        error: "Cannot invite members to inactive clubs",
      });
    }

    // Find user to invite
    let invitee;
    if (inviteeUserId) {
      invitee = await User.findByPk(inviteeUserId);
    } else if (userEmail) {
      invitee = await User.findOne({ where: { email: userEmail } });
    } else {
      return res.status(400).json({
        success: false,
        error: "Either userId or userEmail is required",
      });
    }

    if (!invitee) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check if already a member
    const existingMembership = await ClubMember.findOne({
      where: {
        clubId,
        userId: invitee.id,
      },
    });

    if (existingMembership) {
      if (existingMembership.status === "active") {
        return res.status(400).json({
          success: false,
          error: "User is already a member of this club",
        });
      }

      // Reactivate if previously removed
      existingMembership.status = "active";
      existingMembership.joinedAt = new Date();
      existingMembership.invitedBy = inviterId;
      await existingMembership.save();

      return res.status(200).json({
        success: true,
        data: existingMembership,
        message: "User re-added to club successfully",
      });
    }

    // Get player profile
    const playerProfile = await Player.findOne({ where: { userId: invitee.id } });

    // Create membership
    const membership = await ClubMember.create({
      clubId,
      userId: invitee.id,
      playerId: playerProfile?.id || null,
      role,
      status: "active",
      joinedAt: new Date(),
      invitedBy: inviterId,
      joinMethod: "invited",
    });

    // Update member count
    await club.increment("memberCount");

    return res.status(201).json({
      success: true,
      data: membership,
      message: "Member invited successfully",
    });
  } catch (error) {
    console.error("inviteMember error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Remove member from club
exports.removeMember = async (req, res) => {
  try {
    const { clubId, memberId } = req.params;
    const { userId: actorId, role: actorRole } = req.user;

    // Validate admin access
    const hasAccess = await hasClubAdminAccess(clubId, actorId, actorRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can remove members",
      });
    }

    const membership = await ClubMember.findOne({
      where: {
        id: memberId,
        clubId,
      },
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        error: "Membership not found",
      });
    }

    // Prevent removing the last admin
    if (membership.role === "club_admin") {
      const hasOtherAdmins = await ensureMinimumAdmin(clubId, membership.userId);
      if (!hasOtherAdmins) {
        return res.status(403).json({
          success: false,
          error: "Cannot remove the last club admin. Transfer ownership first.",
        });
      }
    }

    // Soft delete (set status to removed, preserve history)
    const oldStatus = membership.status;
    membership.status = "removed";
    await membership.save();

    // Update member count only if member was active
    if (oldStatus === 'active') {
      const club = await Club.findByPk(clubId);
      if (club.memberCount > 0) {
        await club.decrement("memberCount");
      }
    }

    return res.status(200).json({
      success: true,
      message: "Member removed successfully",
    });
  } catch (error) {
    console.error("removeMember error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Update member role
exports.updateMemberRole = async (req, res) => {
  try {
    const { clubId, memberId } = req.params;
    const { userId: actorId, role: actorRole } = req.user;
    const { role } = req.body;

    if (!role || !["club_admin", "assistant_admin", "member"].includes(role)) {
      return res.status(400).json({
        success: false,
        error: "Invalid role. Must be 'club_admin', 'assistant_admin', or 'member'",
      });
    }

    // Validate admin access (organization owner or club_admin can change roles)
    const hasAccess = await hasClubAdminAccess(clubId, actorId, actorRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can update member roles",
      });
    }

    const membership = await ClubMember.findOne({
      where: {
        id: memberId,
        clubId,
        status: "active",
      },
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        error: "Membership not found",
      });
    }

    // If demoting an admin, ensure there's at least one other admin
    if (membership.role === "club_admin" && role !== "club_admin") {
      const hasOtherAdmins = await ensureMinimumAdmin(clubId, membership.userId);
      if (!hasOtherAdmins) {
        return res.status(403).json({
          success: false,
          error: "Cannot demote the last club admin",
        });
      }
    }

    membership.role = role;
    await membership.save();

    return res.status(200).json({
      success: true,
      data: membership,
      message: "Member role updated successfully",
    });
  } catch (error) {
    console.error("updateMemberRole error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Transfer club ownership
exports.transferOwnership = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId: currentOwnerId } = req.user;
    const { newOwnerId } = req.body;

    if (!newOwnerId) {
      return res.status(400).json({
        success: false,
        error: "newOwnerId is required",
      });
    }

    // Validate current owner is a club admin
    const currentOwnerMembership = await ClubMember.findOne({
      where: {
        clubId,
        userId: currentOwnerId,
        role: "club_admin",
        status: "active",
      },
    });

    if (!currentOwnerMembership) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can transfer ownership",
      });
    }

    // Validate new owner is a member
    const newOwnerMembership = await ClubMember.findOne({
      where: {
        clubId,
        userId: newOwnerId,
        status: "active",
      },
    });

    if (!newOwnerMembership) {
      return res.status(404).json({
        success: false,
        error: "New owner must be a club member",
      });
    }

    // Promote new owner to club_admin
    newOwnerMembership.role = "club_admin";
    await newOwnerMembership.save();

    // Update createdBy in club
    const club = await Club.findByPk(clubId);
    club.createdBy = newOwnerId;
    await club.save();

    return res.status(200).json({
      success: true,
      message: "Ownership transferred successfully",
    });
  } catch (error) {
    console.error("transferOwnership error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Leave club (voluntary)
exports.leaveClub = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { userId } = req.user;

    const membership = await ClubMember.findOne({
      where: {
        clubId,
        userId,
        status: "active",
      },
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        error: "You are not a member of this club",
      });
    }

    // If user is an admin, ensure there's another admin
    if (membership.role === "club_admin") {
      const hasOtherAdmins = await ensureMinimumAdmin(clubId, userId);
      if (!hasOtherAdmins) {
        return res.status(403).json({
          success: false,
          error: "Transfer ownership before leaving. You are the only admin.",
        });
      }
    }

    // Remove membership
    membership.status = "removed";
    await membership.save();

    // Update member count
    const club = await Club.findByPk(clubId);
    if (club.memberCount > 0) {
      await club.decrement("memberCount");
    }

    return res.status(200).json({
      success: true,
      message: "You have left the club successfully",
    });
  } catch (error) {
    console.error("leaveClub error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Update member status (pending -> active, active -> suspended, etc.)
exports.updateMemberStatus = async (req, res) => {
  try {
    const { clubId, memberId } = req.params;
    const { userId: actorId, role: actorRole } = req.user;
    const { status } = req.body;

    if (!status || !["pending", "active", "suspended", "removed"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status. Must be 'pending', 'active', 'suspended', or 'removed'",
      });
    }

    // Validate admin access
    const hasAccess = await hasClubAdminAccess(clubId, actorId, actorRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can update member status",
      });
    }

    const membership = await ClubMember.findOne({
      where: {
        id: memberId,
        clubId,
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "email"],
        },
        {
          model: Player,
          as: "player",
          attributes: ["id", "name"],
        },
      ],
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        error: "Membership not found",
      });
    }

    const oldStatus = membership.status;
    membership.status = status;
    await membership.save();

    // Update member count if status changed to/from active
    const club = await Club.findByPk(clubId);
    if (oldStatus !== 'active' && status === 'active') {
      // Activating a member - increment count
      await club.increment('memberCount');
    } else if (oldStatus === 'active' && status !== 'active') {
      // Deactivating a member - decrement count
      if (club.memberCount > 0) {
        await club.decrement('memberCount');
      }
    }

    return res.status(200).json({
      success: true,
      data: membership,
      message: `Member status updated to ${status}`,
    });
  } catch (error) {
    console.error("updateMemberStatus error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Approve a pending join request
exports.approveMemberRequest = async (req, res) => {
  try {
    const { clubId, memberId } = req.params;
    const { userId: actorId, role: actorRole } = req.user;

    // Validate admin access
    const hasAccess = await hasClubAdminAccess(clubId, actorId, actorRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can approve join requests",
      });
    }

    const membership = await ClubMember.findOne({
      where: {
        id: memberId,
        clubId,
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "email"],
        },
        {
          model: Player,
          as: "player",
          attributes: ["id", "name"],
        },
      ],
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        error: "Member not found",
      });
    }

    // Verify status is pending (or empty/undefined which defaults to pending)
    const currentStatus = membership.status || "pending";
    if (currentStatus === "active") {
      return res.status(400).json({
        success: false,
        error: "Member is already approved",
      });
    }
    if (currentStatus === "rejected") {
      return res.status(400).json({
        success: false,
        error: "Cannot approve a rejected request",
      });
    }

    // Update status to active
    membership.status = "active";
    await membership.save();

    // Increment member count
    const club = await Club.findByPk(clubId);
    if (club) {
      await club.increment('memberCount');
    }

    return res.status(200).json({
      success: true,
      data: membership,
      message: "Join request approved successfully",
    });
  } catch (error) {
    console.error("approveMemberRequest error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Reject a pending join request
exports.rejectMemberRequest = async (req, res) => {
  try {
    const { clubId, memberId } = req.params;
    const { userId: actorId, role: actorRole } = req.user;

    // Validate admin access
    const hasAccess = await hasClubAdminAccess(clubId, actorId, actorRole);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Only club admins can reject join requests",
      });
    }

    // Find membership - accept any non-active status (pending or empty string)
    const membership = await ClubMember.findOne({
      where: {
        id: memberId,
        clubId,
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "email"],
        },
        {
          model: Player,
          as: "player",
          attributes: ["id", "name"],
        },
      ],
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        error: "Member not found",
      });
    }

    // Verify status is pending (or empty/undefined which defaults to pending)
    const currentStatus = membership.status || "pending";
    if (currentStatus === "active") {
      return res.status(400).json({
        success: false,
        error: "Cannot reject an already approved member",
      });
    }

    const user = membership.user || {};

    // Update status to rejected (keep record for history)
    membership.status = "rejected";
    await membership.save();

    return res.status(200).json({
      success: true,
      data: membership,
      message: `Join request from ${user.email || 'player'} has been rejected`,
    });
  } catch (error) {
    console.error("rejectMemberRequest error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

module.exports = exports;
