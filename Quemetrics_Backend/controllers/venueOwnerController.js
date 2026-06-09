const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const {
  VenueOwner,
  User,
  VenueApprovalRequest,
  LeagueVenueRequest,
  Organization,
  Tournament,
  VenueRequest,
  Club,
} = require("../models");

const generateTokens = (userId, role = "venue_owner") => {
  const accessToken = jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
  });
  const refreshToken = jwt.sign({ userId, role }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });
  return { accessToken, refreshToken };
};

/**
 * Resolves the VenueOwner profile for a given user, with email-based auto-linking fallback.
 * This ensures that invited venue owners who log in directly (bypassing the invite link)
 * are still correctly identified and linked to their assigned venues.
 */
const resolveVenueOwner = async (user) => {
  try {
    const uid = user.userId || user.id;
    if (!uid) return null;

    // 1. Primary: Direct lookup by userId
    let venueOwner = await VenueOwner.findOne({ where: { userId: uid } });
    if (venueOwner) return venueOwner;

    // 2. Secondary: Lookup by associated user email
    const userRecord = await User.findByPk(uid);
    if (userRecord && userRecord.email) {
      venueOwner = await VenueOwner.findOne({
        where: {
          email: userRecord.email,
          [require('sequelize').Op.or]: [{ userId: null }, { userId: uid }]
        }
      });

      if (venueOwner) {
        if (venueOwner.userId !== uid) {
          await venueOwner.update({ userId: uid });
        }
        return venueOwner;
      }
    }

    // 3. Tertiary: Virtual Profile for Admins or Orphaned Venue Owners
    // This prevents 404s for users who have the role but no DB record.
    if (user.role === 'super_admin' || user.role === 'venue_owner' || (userRecord && (userRecord.role === 'super_admin' || userRecord.role === 'venue_owner'))) {
      return VenueOwner.build({
        id: `virtual-${uid}`,
        name: userRecord?.name || (user.role === 'super_admin' ? 'System Admin' : 'Venue Owner'),
        venueName: 'Assigned Venue',
        organizationId: uid, // Placeholder organizationId
        isVirtual: true
      });
    }
  } catch (err) {
    console.error("resolveVenueOwner error:", err);
  }

  return null;
};

exports.acceptInvitation = async (req, res) => {
  try {
    console.log("=== ACCEPT INVITATION DEBUG ===");
    console.log("Request body:", JSON.stringify(req.body));
    const { invitationToken, password } = req.body;

    if (!invitationToken) {
      console.log("No invitationToken in request body");
      return res.status(400).json({ success: false, error: "Invitation token is required" });
    }

    const hashedToken = crypto.createHash("sha256").update(invitationToken).digest("hex");
    console.log("Incoming token (plain):", invitationToken);
    console.log("Hashed version:", hashedToken);

    // Check ALL venue_owners for matching token (either hashed or plain)
    let venueOwner = await VenueOwner.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { invitationToken: hashedToken },
          { invitationToken: invitationToken }
        ]
      }
    });
    console.log("Search result:", venueOwner ? `Found: ${venueOwner.id}, ${venueOwner.email}` : "null");

    if (!venueOwner) {
      // Debug: list ALL venue_owners tokens for comparison
      const allWithTokens = await VenueOwner.findAll({
        where: { invitationToken: { [require('sequelize').Op.ne]: null } },
        attributes: ['id', 'email', 'invitationToken']
      });
      console.log("DEBUG - All venue_owners with tokens in DB:");
      allWithTokens.forEach(v => console.log(`  ID: ${v.id}, Email: ${v.email}, Token: ${v.invitationToken}`));
      console.log("DEBUG - Looking for:", `plain="${invitationToken}" OR hashed="${hashedToken}"`);

      return res.status(400).json({ success: false, error: "Invalid invitation token" });
    }

    console.log("Found venue owner:", venueOwner.id, venueOwner.name);

    if (new Date() > venueOwner.invitationExpires) {
      console.log("Invitation expired");
      return res.status(400).json({ success: false, error: "Invitation has expired" });
    }

    if (venueOwner.isInviteAccepted) {
      console.log("Invitation already accepted");
      return res.status(400).json({ success: false, error: "Invitation already accepted" });
    }

    if (!venueOwner.email) {
      console.log("No email associated");
      return res.status(400).json({ success: false, error: "Invalid invitation - no email associated" });
    }

    console.log("Hashing password...");
    const hashedPassword = await bcrypt.hash(password, 12);
    console.log("Password hashed");

    console.log("Looking for user with email:", venueOwner.email);
    // Check if a User with this email already exists (e.g. already a player/organizer)
    let user = await User.findOne({ where: { email: venueOwner.email } });
    console.log("User found:", user ? user.id : "null");

    if (user) {
      // Link the VenueOwner profile to the existing User instead of creating a duplicate.
      // We update the existing user's password only if they don't already have one set via
      // a different registration path — here we leave it unchanged so their existing login
      // credentials keep working.  We do NOT overwrite the password.
      await venueOwner.update({
        userId: user.id,
        invitationToken: null,
        invitationExpires: null,
        isInviteAccepted: true,
        // email: null, // Keep the email for profile resolution fallbacks
      });
    } else {
      // No existing User — create a new one for this venue owner
      console.log("Creating new user...");
      user = await User.create({
        email: venueOwner.email,
        password: hashedPassword,
        role: "venue_owner",
        status: "Active",
        emailVerified: true,
      });
      console.log("User created:", user.id);

      await venueOwner.update({
        userId: user.id,
        invitationToken: null,
        invitationExpires: null,
        isInviteAccepted: true,
        // email: null, // Keep the email for profile resolution fallbacks
      });
    }

    console.log("Generating tokens...");
    const { accessToken, refreshToken } = generateTokens(user.id, "venue_owner");
    await user.update({ refreshToken });

    console.log("Success!");

    res.json({
      success: true,
      data: { accessToken, refreshToken, user: { id: user.id, role: user.role } },
      message: "Invitation accepted successfully. You can now log in with your existing credentials.",
    });
  } catch (error) {
    console.error("acceptInvitation error:", error);
    console.error("Stack:", error.stack);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.getMyProfile = async (req, res) => {
  try {
    const { userId } = req.user;
    const venueOwner = await resolveVenueOwner(req.user);

    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue owner profile not found" });
    }

    // Explicitly refetch with includes if it's a real record
    let detailedVenueOwner = venueOwner;
    if (venueOwner.id && !String(venueOwner.id).startsWith('virtual-')) {
      detailedVenueOwner = await VenueOwner.findByPk(venueOwner.id, {
        include: [
          { model: User, attributes: ["email", "isActive"] },
          { association: "organization", attributes: ["id", "organizationName"] },
        ],
      }) || venueOwner; // Fallback to original if refetch fails
    }

    // Resolve venue name if not set on model
    if (detailedVenueOwner && !detailedVenueOwner.venueName && (detailedVenueOwner.venueIds && detailedVenueOwner.venueIds.length > 0)) {
      try {
        const { Club } = require("../models");
        const allClubs = await Club.findAll({ attributes: ["venues"] });

        const firstVenueId = detailedVenueOwner.venueIds[0];
        let resolvedName = null;

        for (const club of allClubs) {
          if (club.venues && Array.isArray(club.venues)) {
            const foundVenue = club.venues.find(v => v.id === firstVenueId);
            if (foundVenue) {
              resolvedName = foundVenue.name;
              break;
            }
          }
        }

        if (resolvedName) {
          // Attach it to the response object without persisting to DB (it's a virtual field for the response)
          const venueData = detailedVenueOwner.toJSON();
          venueData.venueName = resolvedName;
          return res.json({ success: true, data: venueData, message: "Profile retrieved" });
        }
      } catch (e) {
        console.warn("Failed to resolve venue name for profile:", e.message);
      }
    }

    const { resolveVenueOwnerStructured } = require("../utils/venueOwnerEmbedded");
    const venueData = detailedVenueOwner.toJSON ? detailedVenueOwner.toJSON() : detailedVenueOwner;
    venueData.ownedVenues = await resolveVenueOwnerStructured(detailedVenueOwner);

    res.json({ success: true, data: venueData, message: "Profile retrieved" });
  } catch (error) {
    console.error("getMyProfile error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.getMyVenues = async (req, res) => {
  try {
    const venueOwner = await resolveVenueOwner(req.user);
    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue owner profile not found" });
    }

    const { resolveVenueOwnerStructured } = require("../utils/venueOwnerEmbedded");
    const venues = await resolveVenueOwnerStructured(venueOwner);

    res.json({
      success: true,
      data: venues,
      message: "Venue owner venues retrieved successfully",
    });
  } catch (error) {
    console.error("getMyVenues error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { userId } = req.user;
    const { name, phoneNumber } = req.body;

    const venueOwner = await resolveVenueOwner(req.user);
    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue owner profile not found" });
    }

    await venueOwner.update({ name, phoneNumber });

    res.json({ success: true, data: venueOwner, message: "Profile updated" });
  } catch (error) {
    console.error("updateProfile error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * GET /venue-owner/approval-requests
 * Get all venue approval requests for venues owned by this venue owner
 */
exports.getVenueApprovalRequests = async (req, res) => {
  try {
    console.log("getVenueApprovalRequests: Starting - req.user:", req.user ? { userId: req.user.userId, role: req.user.role } : "undefined");

    const { userId } = req.user;
    if (!userId) {
      console.error("getVenueApprovalRequests: userId not found in req.user");
      return res.status(401).json({ success: false, error: "User not authenticated" });
    }

    // Find the venue owner with email-fallback support
    console.log("getVenueApprovalRequests: Looking for VenueOwner with userId:", userId);
    const { ClubVenue, Club } = require("../models");
    let venueOwner = await resolveVenueOwner(req.user);

    if (venueOwner) {
      // Refresh with includes
      venueOwner = await VenueOwner.findByPk(venueOwner.id, {
        include: [
          {
            model: ClubVenue,
            as: "clubLinks",
            required: false,
            include: [
              {
                model: Club,
                as: "club",
                required: false,
              },
            ],
          },
        ],
      });
    }

    if (!venueOwner) {
      console.log("getVenueApprovalRequests: VenueOwner not found for userId:", userId);
      return res.status(404).json({ success: false, error: "Venue owner profile not found" });
    }

    // Filter by club status: if linked to clubs, at least one must be active
    const links = venueOwner.clubLinks || [];
    const hasActiveClub = links.length === 0 || links.some(link => link.club && link.club.status === "active");

    if (!hasActiveClub) {
      console.log("getVenueApprovalRequests: VenueOwner linked to pending/inactive club(s)");
      return res.json({
        success: true,
        data: [],
        message: "Your associated club is pending approval. Please wait for verification.",
      });
    }

    console.log("getVenueApprovalRequests: Found VenueOwner:", venueOwner.id);
    // Get all approval requests for this venue
    const approvalRequests = await VenueApprovalRequest.findAll({
      where: {
        venueOwnerId: venueOwner.id
      },
      include: [
        {
          model: Organization,
          as: "requestingOrganization",
          attributes: ["id", "organizationName", "contactPersonName", "phoneNumber"],
          include: [
            {
              model: User,
              attributes: ["email"],
              required: false,
            },
          ],
        },
        {
          model: VenueOwner,
          as: "venue",
          attributes: ["id", "venueName", "address"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    console.log("getVenueApprovalRequests: Found", approvalRequests.length, "approval requests");
    res.json({
      success: true,
      data: approvalRequests,
      message: "Approval requests retrieved successfully",
    });
  } catch (error) {
    console.error("getVenueApprovalRequests error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

/**
 * PUT /venue-owner/approval-requests/:requestId/approve
 * Approve a venue approval request
 */
exports.approveApprovalRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { requestId } = req.params;

    const venueOwner = await resolveVenueOwner(req.user);
    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue owner profile not found" });
    }

    const approvalRequest = await VenueApprovalRequest.findByPk(requestId, {
      include: [
        {
          model: VenueOwner,
          as: "venue",
          attributes: ["id", "venueName", "organizationId"],
        },
        {
          model: Organization,
          as: "requestingOrganization",
          attributes: ["id", "organizationName", "userId"],
        },
      ],
    });

    if (!approvalRequest) {
      return res.status(404).json({ success: false, error: "Approval request not found" });
    }

    // Check if request has expired (only if expiresAt exists)
    if (approvalRequest.expiresAt && approvalRequest.requestStatus === "pending" && new Date() > approvalRequest.expiresAt) {
      return res.status(400).json({
        success: false,
        error: "This approval request has expired. The organization must request approval again."
      });
    }

    // Verify this venue owner owns the venue
    if (approvalRequest.venueOwnerId !== venueOwner.id) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to approve this request",
      });
    }

    // Update approval request
    await approvalRequest.update({
      requestStatus: "approved",
      approvedAt: new Date(),
      approvedBy: userId,
    });

    // Send approval email to requesting organization
    const { sendVenueApprovalEmail } = require("../utils/email");
    let requestingOrgUser = null;
    try {
      if (approvalRequest.requestingOrganization?.userId) {
        requestingOrgUser = await User.findByPk(approvalRequest.requestingOrganization.userId);
      }
    } catch (resolveErr) {
      console.warn("Failed to resolve requesting organization user:", resolveErr.message || resolveErr);
    }

    if (requestingOrgUser && requestingOrgUser.email) {
      await sendVenueApprovalEmail({
        recipientEmail: requestingOrgUser.email,
        recipientName: approvalRequest.requestingOrganization?.organizationName || requestingOrgUser.email,
        venueName: approvalRequest.venue.venueName,
        venueOwnerName: venueOwner.name || venueOwner.venueName,
        status: "approved",
      });
    }

    res.json({
      success: true,
      data: approvalRequest,
      message: "Venue approval granted successfully",
    });
  } catch (error) {
    console.error("approveApprovalRequest error:", error.message || error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * PUT /venue-owner/approval-requests/:requestId/reject
 * Reject a venue approval request
 */
exports.rejectApprovalRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { requestId } = req.params;
    const { rejectionReason } = req.body;

    const venueOwner = await resolveVenueOwner(req.user);
    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue owner profile not found" });
    }

    const approvalRequest = await VenueApprovalRequest.findByPk(requestId, {
      include: [
        {
          model: VenueOwner,
          as: "venue",
          attributes: ["id", "venueName", "organizationId"],
        },
        {
          model: Organization,
          as: "requestingOrganization",
          attributes: ["id", "organizationName", "userId"],
        },
      ],
    });

    if (!approvalRequest) {
      return res.status(404).json({ success: false, error: "Approval request not found" });
    }

    // Check if request has expired (only if expiresAt exists)
    if (approvalRequest.expiresAt && approvalRequest.requestStatus === "pending" && new Date() > approvalRequest.expiresAt) {
      return res.status(400).json({
        success: false,
        error: "This approval request has expired. The organization must request approval again."
      });
    }

    // Verify this venue owner owns the venue
    if (approvalRequest.venueOwnerId !== venueOwner.id) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to reject this request",
      });
    }

    // Update approval request
    await approvalRequest.update({
      requestStatus: "rejected",
      rejectedAt: new Date(),
      rejectedBy: userId,
      rejectionReason: rejectionReason || null,
    });

    // Send rejection email to requesting organization
    const { sendVenueApprovalEmail } = require("../utils/email");
    let requestingOrgUser = null;
    try {
      if (approvalRequest.requestingOrganization?.userId) {
        requestingOrgUser = await User.findByPk(approvalRequest.requestingOrganization.userId);
      }
    } catch (resolveErr) {
      console.warn("Failed to resolve requesting organization user:", resolveErr.message || resolveErr);
    }

    if (requestingOrgUser && requestingOrgUser.email) {
      await sendVenueApprovalEmail({
        recipientEmail: requestingOrgUser.email,
        recipientName: approvalRequest.requestingOrganization?.organizationName || requestingOrgUser.email,
        venueName: approvalRequest.venue.venueName,
        venueOwnerName: venueOwner.name || venueOwner.venueName,
        status: "rejected",
        reason: rejectionReason,
      });
    }

    res.json({
      success: true,
      data: approvalRequest,
      message: "Venue approval request rejected",
    });
  } catch (error) {
    console.error("rejectApprovalRequest error:", error.message || error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ==========================================
// League Venue Requests
// ==========================================

// exports.getLeagueVenueRequests = async (req, res) => {
//   try {
//     const { userId } = req.user;

//     const venueOwner = await VenueOwner.findOne({
//     const { ClubVenue, Club } = require("../models");
//     const venueOwner = await VenueOwner.findOne({
//       where: { userId },
//       attributes: { exclude: ['status'] },
//       include: [
//         {
//           model: ClubVenue,
//           as: "clubLinks",
//           required: false,
//           include: [
//             {
//               model: Club,
//               as: "club",
//               required: false,
//             },
//           ],
//         },
//       ],
//     });

//     if (!venueOwner) {
//       return res.status(404).json({ success: false, error: "Venue owner profile not found" });
//     }

//     // Filter by club status: if linked to clubs, at least one must be active
//     const links = venueOwner.clubLinks || [];
//     const hasActiveClub = links.length === 0 || links.some(link => link.club && link.club.status === "active");

//     if (!hasActiveClub) {
//       return res.json({
//         success: true,
//         data: [],
//         message: "Your associated club is pending approval.",
//       });
//     }

//     const { LeagueVenueRequest, Organization, League } = require("../models");

//     // Get all league-specific venue requests
//     const leagueRequests = await LeagueVenueRequest.findAll({
//       where: { venueOwnerId: venueOwner.id },
//       include: [
//         {
//           model: Organization,
//           as: "organization",
//           attributes: ["id", "organizationName", "contactPersonName"],
//         },
//         {
//           model: VenueOwner,
//           as: "venueOwner",
//           attributes: ["id", "venueName", "address"],
//         },
//         {
//           model: League,
//           as: "league",
//           attributes: ["id", "name"],
//         }
//       ],
//       order: [["createdAt", "DESC"]],
//     });

//     // Normalize league requests - remove null venueOwner and clean up response
//     const allRequests = leagueRequests.map(r => {
//       const requestData = r.toJSON();
//       // Remove the venueOwner object since it's null and we have venueName in the request
//       delete requestData.venueOwner;

//       return {
//         ...requestData,
//         type: 'league_request',
//         requestingOrganization: r.organization,
//         leagueName: r.league?.name,
//         venueName: r.venueName, // Use the venue name from the request (not the null venueOwner.venueName)
//         status: r.status,
//       };
//     });

//     res.json({
//       success: true,
//       data: allRequests,
//       message: "Venue requests retrieved successfully",
//     });
//   } catch (error) {
//     console.error("getLeagueVenueRequests error:", error);
//     res.status(500).json({ success: false, error: "Internal server error" });
//   }
// };
// }

exports.getLeagueVenueRequests = async (req, res) => {
  try {
    const { userId } = req.user;
    const { ClubVenue, Club } = require("../models");
    let venueOwner = await resolveVenueOwner(req.user);

    if (venueOwner) {
      // Refresh with includes
      venueOwner = await VenueOwner.findByPk(venueOwner.id, {
        include: [
          {
            model: ClubVenue,
            as: "clubLinks",
            required: false,
            include: [
              {
                model: Club,
                as: "club",
                required: false,
              },
            ],
          },
        ],
      });
    }

    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue owner profile not found" });
    }

    // Filter by club status: if linked to clubs, at least one must be active
    const links = venueOwner.clubLinks || [];
    const hasActiveClub = links.length === 0 || links.some(link => link.club && link.club.status === "active");

    if (!hasActiveClub) {
      return res.json({
        success: true,
        data: [],
        message: "Your associated club is pending approval.",
      });
    }

    const { LeagueVenueRequest, Organization, League } = require("../models");

    // Get all league-specific venue requests
    const leagueRequests = await LeagueVenueRequest.findAll({
      where: { venueOwnerId: venueOwner.id },
      include: [
        {
          model: Organization,
          as: "organization",
          attributes: ["id", "organizationName", "contactPersonName"],
        },
        {
          model: VenueOwner,
          as: "venueOwner",
          attributes: ["id", "venueName", "address"],
        },
        {
          model: League,
          as: "league",
          attributes: ["id", "name"],
        }
      ],
      order: [["createdAt", "DESC"]],
    });

    const { normalizeVenueToken, parseVenueCollections } = require("../utils/venueOwnerEmbedded");

    // Fetch all active clubs to guarantee we find the specific sub-venue name
    const allClubs = await Club.findAll({
      attributes: ['id', 'venues', 'name'],
      raw: true
    });

    // Build a map of all venues from clubs and embedded venues
    const clubVenuesMap = new Map();
    for (const club of allClubs) {
      if (club.venues) {
        const venuesArray = parseVenueCollections(club.venues);
        for (const v of venuesArray) {
          if (v && (v.id || v.venueId)) {
            clubVenuesMap.set(normalizeVenueToken(v.id || v.venueId).toLowerCase(), v.name || v.venueName);
          }
        }
      }
    }

    if (venueOwner.venues) {
      const embeddedVenues = parseVenueCollections(venueOwner.venues);
      for (const v of embeddedVenues) {
        if (v && (v.id || v.venueId)) {
          clubVenuesMap.set(normalizeVenueToken(v.id || v.venueId).toLowerCase(), v.name || v.venueName);
        }
      }
    }

    // Normalize league requests - remove null venueOwner and clean up response
    const allRequests = leagueRequests.map(r => {
      const requestData = r.toJSON();
      // Remove the venueOwner object since it's null and we have venueName in the request
      delete requestData.venueOwner;

      let resolvedVenueName = r.venueName;

      // Try to find the specific sub-venue name from the maps
      if (r.venueId) {
        let venueRef = String(r.venueId);
        if (venueRef.includes(':')) {
          venueRef = venueRef.slice(venueRef.indexOf(':') + 1).trim();
        }
        const normRef = normalizeVenueToken(venueRef).toLowerCase();

        if (clubVenuesMap.has(normRef)) {
          resolvedVenueName = clubVenuesMap.get(normRef);
        }
      }

      return {
        ...requestData,
        type: 'league_request',
        requestingOrganization: r.organization,
        leagueName: r.league?.name,
        venueName: resolvedVenueName,
        status: r.status,
      };
    });

    res.json({
      success: true,
      data: allRequests,
      message: "Venue requests retrieved successfully",
    });
  } catch (error) {
    console.error("getLeagueVenueRequests error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.approveLeagueVenueRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { requestId } = req.params;

    const venueOwner = await resolveVenueOwner(req.user);
    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue owner profile not found" });
    }

    const { VenueApprovalRequest, LeagueVenueRequest, User } = require("../models");

    // Try finding in VenueApprovalRequest first
    let request = await VenueApprovalRequest.findByPk(requestId);
    let isLeagueTable = false;

    if (!request) {
      // Try finding in LeagueVenueRequest
      request = await LeagueVenueRequest.findByPk(requestId);
      if (request) isLeagueTable = true;
    }

    if (!request) {
      return res.status(404).json({ success: false, error: "Venue request not found" });
    }

    if (request.venueOwnerId !== venueOwner.id) {
      return res.status(403).json({ success: false, error: "You cannot approve this request" });
    }

    if (isLeagueTable) {
      await request.update({ status: "approved" });
    } else {
      await request.update({
        requestStatus: "approved",
        approvedAt: new Date(),
        approvedBy: userId
      });
    }

    // Send approval email logic could be added here if needed,
    // but often it's already handled in the organizationController or leagueController.
    // For consistency with organizationController:
    const { sendVenueApprovalEmail } = require("../utils/email");
    let requestingOrgId = request.organizationId || request.requestingOrganizationId;
    let requestingOrgUser = null;
    if (requestingOrgId) {
      const { Organization } = require("../models");
      const requestingOrg = await Organization.findByPk(requestingOrgId);
      if (requestingOrg && requestingOrg.userId) {
        requestingOrgUser = await User.findByPk(requestingOrg.userId);
      }
    }

    if (requestingOrgUser && requestingOrgUser.email) {
      await sendVenueApprovalEmail({
        recipientEmail: requestingOrgUser.email,
        recipientName: requestingOrgUser.email, // or org name if available
        venueName: venueOwner.venueName,
        venueOwnerName: venueOwner.name || venueOwner.venueName,
        status: "approved",
      });
    }

    res.json({
      success: true,
      data: request,
      message: "Venue request approved",
    });
  } catch (error) {
    console.error("approveLeagueVenueRequest error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.rejectLeagueVenueRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { requestId } = req.params;
    const { rejectionReason } = req.body;

    const venueOwner = await resolveVenueOwner(req.user);
    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue owner profile not found" });
    }

    const { VenueApprovalRequest, LeagueVenueRequest, User } = require("../models");

    // Try finding in VenueApprovalRequest first
    let request = await VenueApprovalRequest.findByPk(requestId);
    let isLeagueTable = false;

    if (!request) {
      // Try finding in LeagueVenueRequest
      request = await LeagueVenueRequest.findByPk(requestId);
      if (request) isLeagueTable = true;
    }

    if (!request) {
      return res.status(404).json({ success: false, error: "Venue request not found" });
    }

    if (request.venueOwnerId !== venueOwner.id) {
      return res.status(403).json({ success: false, error: "You cannot reject this request" });
    }

    if (isLeagueTable) {
      await request.update({
        status: "rejected",
        rejectionReason: rejectionReason || null
      });
    } else {
      await request.update({
        requestStatus: "rejected",
        rejectedAt: new Date(),
        rejectedBy: userId,
        rejectionReason: rejectionReason || null,
      });
    }

    // Send rejection email
    const { sendVenueApprovalEmail } = require("../utils/email");
    let requestingOrgId = request.organizationId || request.requestingOrganizationId;
    let requestingOrgUser = null;
    if (requestingOrgId) {
      const { Organization } = require("../models");
      const requestingOrg = await Organization.findByPk(requestingOrgId);
      if (requestingOrg && requestingOrg.userId) {
        requestingOrgUser = await User.findByPk(requestingOrg.userId);
      }
    }

    if (requestingOrgUser && requestingOrgUser.email) {
      await sendVenueApprovalEmail({
        recipientEmail: requestingOrgUser.email,
        recipientName: requestingOrgUser.email,
        venueName: venueOwner.venueName,
        venueOwnerName: venueOwner.name || venueOwner.venueName,
        status: "rejected",
        reason: rejectionReason,
      });
    }

    res.json({
      success: true,
      data: request,
      message: "Venue request rejected",
    });
  } catch (error) {
    console.error("rejectLeagueVenueRequest error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.getTournamentVenueRequests = async (req, res) => {
  try {
    const { userId } = req.user;
    const venueOwner = await VenueOwner.findOne({ where: { userId } });
    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue owner profile not found" });
    }

    const rows = await VenueRequest.findAll({
      where: { venueOwnerId: venueOwner.id },
      include: [
        {
          model: Tournament,
          as: "tournament",
          attributes: ["id", "name", "clubId", "startDate", "endDate", "status", "venueRequestStatus"],
          include: [{ model: Club, as: "club", attributes: ["id", "name"] }],
        },
        {
          model: Organization,
          as: "requestingOrganization",
          attributes: ["id", "organizationName"],
        },
        {
          model: VenueOwner,
          as: "venueOwner",
          attributes: ["id", "venueName", "name"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json({
      success: true,
      data: rows.map((r) => r.toJSON()),
      message: "Tournament venue requests retrieved successfully",
    });
  } catch (error) {
    console.error("getTournamentVenueRequests error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.acceptTournamentVenueRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { requestId } = req.params;
    const venueOwner = await VenueOwner.findOne({ where: { userId } });
    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue owner profile not found" });
    }

    const request = await VenueRequest.findByPk(requestId, {
      include: [{ model: Tournament, as: "tournament" }],
    });

    if (!request) {
      return res.status(404).json({ success: false, error: "Request not found" });
    }
    if (request.venueOwnerId !== venueOwner.id) {
      return res.status(403).json({ success: false, error: "You cannot act on this request" });
    }
    if (request.status !== "pending") {
      return res.status(400).json({ success: false, error: "This request is no longer pending" });
    }

    await request.update({ status: "accepted" });
    if (request.tournament) {
      let existingVenueIds = [];
      const rawVenueIds = request.tournament.venueIds;
      if (Array.isArray(rawVenueIds)) {
        existingVenueIds = rawVenueIds;
      } else if (typeof rawVenueIds === "string") {
        try {
          const parsed = JSON.parse(rawVenueIds);
          if (Array.isArray(parsed)) existingVenueIds = parsed;
        } catch (_) {
          existingVenueIds = [];
        }
      } else if (rawVenueIds && typeof rawVenueIds === "object") {
        existingVenueIds = Object.values(rawVenueIds).filter(Boolean);
      }

      const approvedVenueId = String(request.venueId || request.venueOwnerId || "").trim();
      const mergedVenueIds = approvedVenueId
        ? [...new Set([...existingVenueIds.map((id) => String(id).trim()).filter(Boolean), approvedVenueId])]
        : [...new Set(existingVenueIds.map((id) => String(id).trim()).filter(Boolean))];

      await request.tournament.update({
        venueRequestStatus: "approved",
        venueId: approvedVenueId || request.tournament.venueId || null,
        venueIds: mergedVenueIds,
      });
    }

    res.json({
      success: true,
      data: request,
      message: "Tournament venue request accepted",
    });
  } catch (error) {
    console.error("acceptTournamentVenueRequest error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.rejectTournamentVenueRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { requestId } = req.params;
    const venueOwner = await VenueOwner.findOne({ where: { userId } });
    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue owner profile not found" });
    }

    const request = await VenueRequest.findByPk(requestId, {
      include: [{ model: Tournament, as: "tournament" }],
    });

    if (!request) {
      return res.status(404).json({ success: false, error: "Request not found" });
    }
    if (request.venueOwnerId !== venueOwner.id) {
      return res.status(403).json({ success: false, error: "You cannot act on this request" });
    }
    if (request.status !== "pending") {
      return res.status(400).json({ success: false, error: "This request is no longer pending" });
    }

    await request.update({ status: "rejected" });
    if (request.tournament) {
      await request.tournament.update({ venueRequestStatus: "rejected" });
    }

    res.json({
      success: true,
      data: request,
      message: "Tournament venue request rejected",
    });
  } catch (error) {
    console.error("rejectTournamentVenueRequest error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const { userId } = req.user;
    const venueOwner = await resolveVenueOwner(req.user);
    const { Booking, Club } = require('../models');

    if (!venueOwner) {
      return res.json({
        success: true,
        data: {
          todaysBookings: 0,
          memberBookings: 0,
          upcomingBookings: 0,
          venueName: 'No Venue Assigned',
          tables: [],
          message: 'Please contact your organization to assign venues to your account.'
        }
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const { resolveVenueOwnerStructured } = require('../utils/venueOwnerEmbedded');
    const venues = await resolveVenueOwnerStructured(venueOwner);

    // Build flat tables list for backward compatibility
    const tables = [];
    venues.forEach(v => {
      v.tables.forEach(t => {
        tables.push({
          ...t,
          id: tables.length + 1, // Ensure unique IDs in the flat list
          venueName: v.name
        });
      });
    });

    const venueDisplayName = venues.length > 0 ? venues[0].name : (venueOwner.venueName || venueOwner.name || 'Venue');
    const venueIds = venues.map(v => v.id);

    // Get actual booking counts
    const { Op } = require('sequelize');
    const todaysBookings = await Booking.count({
      where: {
        [Op.or]: [
          { venueOwnerId: venueOwner.id },
          { venueId: { [Op.in]: venueIds } }
        ],
        bookingDate: today,
        status: ['pending', 'confirmed', 'completed']
      }
    });

    const upcomingBookings = await Booking.count({
      where: {
        [Op.or]: [
          { venueOwnerId: venueOwner.id },
          { venueId: { [Op.in]: venueIds } }
        ],
        bookingDate: { [Op.between]: [today, sevenDaysFromNow] },
        status: ['pending', 'confirmed', 'completed']
      }
    });

    res.json({ success: true, data: { todaysBookings, memberBookings: 6, upcomingBookings, venueName: venueDisplayName, tables, venues } });
  } catch (error) { console.error("getDashboardStats error:", error); res.status(500).json({ success: false, error: "Internal server error" }); }
};



exports.getSlotAvailability = async (req, res) => {
  try {
    const { userId } = req.user;
    const { date } = req.query;
    const venueOwner = await resolveVenueOwner(req.user);
    const { Booking, Club } = require('../models');

    if (!venueOwner) return res.status(404).json({ success: false, error: "Venue owner profile not found. Please contact admin." });

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDayName = days[targetDate.getDay()];

    const { resolveVenueOwnerStructured } = require('../utils/venueOwnerEmbedded');
    const venues = await resolveVenueOwnerStructured(venueOwner);

    const ownerVenueSlots = [];
    const tables = [];

    venues.forEach(v => {
      // Collect tables
      v.tables.forEach(t => {
        tables.push({
          ...t,
          id: tables.length + 1,
          tableNumber: tables.length + 1,
          venueId: v.id,
          venueName: v.name
        });
      });

      // Collect slots
      if (v.slots) {
        v.slots.forEach(slot => {
          ownerVenueSlots.push({
            ...slot,
            venueId: v.id,
            venueName: v.name
          });
        });
      }
    });

    const finalVenueName = venues.length > 0 ? venues[0].name : (venueOwner.venueName || venueOwner.name || 'Venue');
    const venueIds = venues.map(v => v.id);

    // Get all bookings for this date
    const { Op } = require('sequelize');
    const { Player } = require('../models');
    const bookings = await Booking.findAll({
      where: {
        [Op.or]: [
          { venueOwnerId: venueOwner.id },
          { venueId: { [Op.in]: venueIds } }
        ],
        bookingDate: targetDate.toISOString().split('T')[0],
        status: ['pending', 'confirmed', 'completed']
      },
      include: [
        {
          model: Player,
          as: 'player',
          attributes: ['name', 'nickname'],
          required: false
        }
      ]
    });

    // Filter slots for target day
    const daySlots = ownerVenueSlots.filter(slot => slot.day === targetDayName).sort((a, b) => a.startTime.localeCompare(b.startTime));

    // Normalize time helper (returns HH:mm)
    const normalizeTime = (t) => {
      if (!t) return '';
      const str = String(t).split('.')[0];
      if (str.length === 8) return str.substring(0, 5); // HH:mm:ss → HH:mm
      if (str.length === 5) return str; // already HH:mm
      return str;
    };

    // Normalize table name/id for robust comparison
    const normalizeTable = (name) => String(name).toLowerCase().replace(/\s+/g, '');

    // Build time slots response
    const timeSlots = daySlots.map(slot => {
      const tableStatus = [];
      tables.forEach(table => {
        const isSlotForTable = normalizeTable(slot.tableName) === normalizeTable(table.identifier);
        if (isSlotForTable) {
          const booking = bookings.find(b => {
            // Compare tableNumber as string, and time as HH:mm
            return String(b.tableNumber) === String(table.tableNumber)
              && normalizeTime(b.startTime) === normalizeTime(slot.startTime);
          });
          tableStatus.push(booking ? {
            status: ['confirmed', 'completed'].includes(booking.status) ? 'booked' : 'pending',
            bookingId: booking.id,
            slotId: slot.id,
            playerName: booking.memberBookingName || booking.player?.nickname || booking.player?.name || 'League Match'
          } : { status: 'available', slotId: slot.id });
        } else {
          tableStatus.push({ status: 'unavailable' });
        }
      });
      return { id: slot.id, time: `${slot.startTime} - ${slot.endTime}`, startTime: slot.startTime, endTime: slot.endTime, tableStatus };
    });

    // Disable caching for this endpoint
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json({ success: true, data: { venueName: finalVenueName, date: targetDate.toISOString().split('T')[0], day: targetDayName, tables, timeSlots, venues } });
  } catch (error) { console.error("getSlotAvailability error:", error); res.status(500).json({ success: false, error: "Internal server error" }); }
};

exports.getAllBookings = async (req, res) => {
  try {
    const venueOwner = await resolveVenueOwner(req.user);
    if (!venueOwner) return res.status(404).json({ success: false, error: "Venue owner profile not found." });
    const { Booking, Player, Fixture, League } = require('../models');
    const { Op } = require('sequelize');
    const venueIds = venueOwner.venueIds || [];

    const bookings = await Booking.findAll({
      where: {
        [Op.or]: [
          { venueOwnerId: venueOwner.id },
          { venueId: { [Op.in]: venueIds } }
        ]
      },
      include: [
        { model: Player, as: 'player', attributes: ['name', 'nickname'], required: false },
        { model: Player, as: 'opponent', attributes: ['name', 'nickname'], required: false },
        { model: Fixture, as: 'fixture', attributes: ['round', 'matchNumber'], required: false },
        { model: League, as: 'league', attributes: ['name', 'sport'], required: false }
      ],
      order: [['bookingDate', 'DESC'], ['startTime', 'DESC']]
    });

    const { resolveVenueOwnerStructured } = require('../utils/venueOwnerEmbedded');
    const venues = await resolveVenueOwnerStructured(venueOwner);

    res.json({ success: true, data: { bookings, venues } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

exports.getMemberBookings = async (req, res) => {
  try {
    const venueOwner = await resolveVenueOwner(req.user);
    if (!venueOwner) return res.status(404).json({ success: false, error: "Venue owner profile not found." });
    const { Booking } = require('../models');

    const bookings = await Booking.findAll({
      where: {
        venueOwnerId: venueOwner.id,
        fixtureId: null // Only manual bookings
      },
      order: [['bookingDate', 'DESC']]
    });

    const { resolveVenueOwnerStructured } = require('../utils/venueOwnerEmbedded');
    const venues = await resolveVenueOwnerStructured(venueOwner);

    res.json({ success: true, data: { bookings, venues } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

exports.createMemberBooking = async (req, res) => {
  try {
    const venueOwner = await resolveVenueOwner(req.user);
    if (!venueOwner) return res.status(404).json({ success: false, error: "Venue owner profile not found." });
    const { Booking } = require('../models');
    const { date, startTime, endTime, tableNumber, tableName, memberName, phone, price, notes } = req.body;

    const booking = await Booking.create({
      venueOwnerId: venueOwner.id,
      bookingDate: date,
      startTime,
      endTime,
      tableNumber,
      tableName: tableName || `Table ${tableNumber}`,
      memberBookingName: memberName,
      memberBookingPhone: phone,
      memberBookingPrice: price,
      notes,
      status: 'confirmed', // Auto-confirm member bookings
      sport: 'snooker' // Default or based on venue
    });

    res.status(201).json({ success: true, data: booking });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

exports.deleteBooking = async (req, res) => {
  try {
    const venueOwner = await resolveVenueOwner(req.user);
    if (!venueOwner) return res.status(404).json({ success: false, error: "Venue owner profile not found." });
    const { Booking } = require('../models');
    const { bookingId } = req.params;

    const booking = await Booking.findOne({ where: { id: bookingId, venueOwnerId: venueOwner.id } });
    if (!booking) return res.status(404).json({ success: false, error: "Booking not found or unauthorized." });

    await booking.destroy();
    res.json({ success: true, message: "Booking deleted successfully." });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};
