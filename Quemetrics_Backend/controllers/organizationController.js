const crypto = require("crypto");
const sequelize = require("../config/db");
const { DataTypes, Op } = require("sequelize");
const { Organization, VenueOwner, User, Season, Game, AuditLog, Player, Club } = require("../models");
const { sendVenueOwnerInvitation } = require("../utils/email");
const { ensureVenueOwnerVenuesColumn } = require("../utils/ensureVenueOwnerVenuesColumn");

// Helper: ensure expected columns exist on `venue_owners` table (adds them if missing)
const ensureVenueOwnerColumns = async () => {
  try {
    await ensureVenueOwnerVenuesColumn();
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable("venue_owners");

    // venueIds (JSON)
    if (!tableDesc.venueIds) {
      try {
        await qi.addColumn("venue_owners", "venueIds", {
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: [],
        });
        console.log("Added column venueIds to venue_owners");
      } catch (e) {
        console.error("Failed to add venueIds column:", e.message || e);
      }
    }

    // emailSent
    if (!tableDesc.emailSent) {
      try {
        await qi.addColumn("venue_owners", "emailSent", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        });
        console.log("Added column emailSent to venue_owners");
      } catch (e) {
        console.error("Failed to add emailSent column:", e.message || e);
      }
    }

    // emailSentAt
    if (!tableDesc.emailSentAt) {
      try {
        await qi.addColumn("venue_owners", "emailSentAt", {
          type: DataTypes.DATE,
          allowNull: true,
        });
        console.log("Added column emailSentAt to venue_owners");
      } catch (e) {
        console.error("Failed to add emailSentAt column:", e.message || e);
      }
    }
  } catch (err) {
    console.error("ensureVenueOwnerColumns error:", err.message || err);
  }
};

const normalizeVenueKey = (id) => String(id || "").trim();

const computeSeasonStatus = (season) => {
  const start = season?.startDate ? new Date(season.startDate) : null;
  const end = season?.endDate ? new Date(season.endDate) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return season?.status || "upcoming";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (start <= today && end >= today) return "active";
  if (end < today) return "completed";
  return "upcoming";
};

const serializeSeason = (season) => {
  if (!season) return season;
  const plain = typeof season.toJSON === "function" ? season.toJSON() : { ...season };
  return {
    ...plain,
    status: computeSeasonStatus(plain),
  };
};

const normalizeVenueToken = (value) =>
  String(value || "")
    .replace(/^(venue_|virtual_)/, "")
    .trim();

/** Parse club.venues whether array, JSON string, or empty */
const parseClubVenuesArray = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  if (typeof raw === "object") return Object.values(raw || {});
  return [];
};

/**
 * Map venue id tokens → club venue payload for an organization (club embedded venues).
 */
const buildClubVenueLookupForOrganization = async (organizationId) => {
  const clubs = await Club.findAll({
    where: { organizationId },
    attributes: ["id", "name", "venues"],
  });
  const byToken = new Map();
  for (const club of clubs) {
    const list = parseClubVenuesArray(club.get ? club.get("venues") : club.venues);
    for (const v of list) {
      const rawIds = [v?.id, v?.venueId, v?._id].filter(Boolean).map(normalizeVenueKey);
      const keys = [...new Set(rawIds.flatMap((k) => [k, normalizeVenueToken(k)].filter(Boolean)))];
      const payload = { venue: v, clubId: club.id, clubName: club.name };
      for (const k of keys) {
        if (k && !byToken.has(k)) byToken.set(k, payload);
      }
    }
  }
  return byToken;
};

const lookupClubVenue = (lookup, vid) => {
  const key = normalizeVenueKey(vid);
  if (!key) return null;
  if (lookup.has(key)) return lookup.get(key);
  const nt = normalizeVenueToken(key);
  if (nt && lookup.has(nt)) return lookup.get(nt);
  for (const [k, val] of lookup.entries()) {
    if (normalizeVenueToken(k) === nt) return val;
  }
  return null;
};

exports.getMyOrganization = async (req, res) => {
  try {
    const { userId } = req.user;

    const organization = await Organization.findOne({
      where: { userId },
      include: [{ model: User, attributes: ["email"] }],
    });

    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    res.json({ success: true, data: organization, message: "Organization retrieved" });
  } catch (error) {
    console.error("getMyOrganization error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.updateOrganization = async (req, res) => {
  try {
    const { userId } = req.user;
    const updateData = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    await organization.update(updateData);

    res.json({ success: true, data: organization, message: "Organization updated" });
  } catch (error) {
    console.error("updateOrganization error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.inviteVenueOwner = async (req, res) => {
  try {
    // Ensure DB schema has required columns (helps when migrations haven't been run)
    await ensureVenueOwnerColumns();

    const { userId } = req.user;
    const { email, name, phoneNumber, venueIds = [] } = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    // Safety check: prevent inviting an email that already belongs to a registered user.
    // Temporarily commented out per request to allow inviting existing emails.
    // const existingUser = await User.findOne({ where: { email } });
    // if (existingUser) {
    //   return res.status(400).json({ success: false, error: "Email already registered" });
    // }

    const invitationToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(invitationToken).digest("hex");
    const invitationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Check if email already invited but not accepted
    const existingInvite = await VenueOwner.findOne({ where: { email } });
    if (existingInvite) {
      return res.status(400).json({ success: false, error: "This email has already been invited" });
    }

    const venueOwner = await VenueOwner.create({
      organizationId: organization.id,
      name,
      email,
      phoneNumber,
      invitationToken: hashedToken,
      invitationExpires,
      isInviteAccepted: false,
      venueIds: Array.isArray(venueIds) ? venueIds : [],
    });

    // Resolve venue names for the invitation email (if any)
    let selectedVenueNames = [];
    try {
      if (Array.isArray(venueIds) && venueIds.length) {
        const clubs = await Club.findAll({ where: { organizationId: organization.id } });
        const venueMap = {};
        clubs.forEach((c) => {
          const vs = c.venues || [];
          if (Array.isArray(vs)) {
            vs.forEach((v) => {
              const id = v.id || v.venueId || v._id || v.name;
              const vname = v.name || v.venueName || (c.name ? `${c.name} - ${v.name || v.venueName || 'Venue'}` : v.name || v.venueName);
              if (id) venueMap[id] = vname;
            });
          }
        });
        selectedVenueNames = venueIds.map((id) => venueMap[id] || id).filter(Boolean);
      }
    } catch (resolveErr) {
      console.error('Failed to resolve venue names for invitation email:', resolveErr);
      selectedVenueNames = venueIds || [];
    }

    // Send invitation email (include selected venue names)
    // Use original token (not hashed) for the email link
    const emailResult = await sendVenueOwnerInvitation({
      email,
      name,
      invitationToken: invitationToken, // original unhashed token for URL
      organizationName: organization.organizationName,
      venueNames: selectedVenueNames,
    });

    if (!emailResult.success) {
      console.error("Failed to send invitation email:", emailResult.error);
    }

    // Persist email send status on the invite record
    try {
      await venueOwner.update({
        emailSent: !!emailResult.success,
        emailSentAt: emailResult.success ? new Date() : null,
      });
    } catch (updErr) {
      console.error('Failed to update venueOwner email status:', updErr);
    }

    res.status(201).json({
      success: true,
      data: { venueOwner, invitationEmail: email, emailSent: emailResult.success },
      message: emailResult.success
        ? "Venue owner invited successfully. Invitation email sent."
        : "Venue owner invited but email could not be sent. Please share the invitation link manually.",
    });
  } catch (error) {
    console.error("inviteVenueOwner error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.getMyVenueOwners = async (req, res) => {
  try {
    // Ensure DB schema has expected columns before querying
    await ensureVenueOwnerColumns();

    const { userId } = req.user;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    let venueOwners;
    try {
      // Try to include linked User profile (may fail if DB schema missing foreign key column)
      venueOwners = await VenueOwner.findAll({
        where: { organizationId: organization.id },
        attributes: { exclude: ['status'] },
        include: [{ model: User, attributes: ["email", "isActive"] }],
      });
    } catch (incErr) {
      console.error('Including User in VenueOwner query failed, retrying without include:', incErr.message || incErr);
      // Fallback: fetch venue owners without join
      venueOwners = await VenueOwner.findAll({
        where: { organizationId: organization.id },
        attributes: { exclude: ['status'] }
      });
    }

    const clubVenueLookup = await buildClubVenueLookupForOrganization(organization.id);

    const data = venueOwners.map((vo) => {
      const row = typeof vo.toJSON === "function" ? vo.toJSON() : { ...vo };
      const ids = Array.isArray(row.venueIds) ? row.venueIds : [];
      const resolvedFromClub = [];
      for (const vid of ids) {
        const hit = lookupClubVenue(clubVenueLookup, vid);
        if (hit) {
          const v = hit.venue;
          resolvedFromClub.push({
            ...v,
            clubId: hit.clubId,
            clubName: hit.clubName,
          });
        }
      }

      let venueName = row.venueName;
      if (venueName == null || String(venueName).trim() === "") {
        if (resolvedFromClub.length === 1) {
          const v0 = resolvedFromClub[0];
          venueName = v0.name || v0.venueName || null;
        } else if (resolvedFromClub.length > 1) {
          venueName = resolvedFromClub
            .map((v) => v.name || v.venueName)
            .filter(Boolean)
            .join(" · ") || null;
        }
      }

      const venuesOut =
        resolvedFromClub.length > 0
          ? resolvedFromClub
          : row.venues != null
            ? row.venues
            : [];

      return {
        ...row,
        venueName,
        venues: venuesOut,
      };
    });

    res.set({
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    return res.json({ success: true, data, message: "Venue owners retrieved" });
  } catch (error) {
    console.error("getMyVenueOwners error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.removeVenueOwner = async (req, res) => {
  try {
    const { userId } = req.user;
    const { venueOwnerId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const venueOwner = await VenueOwner.findOne({
      where: { id: venueOwnerId, organizationId: organization.id },
    });

    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue owner not found" });
    }

    if (venueOwner.userId) {
      await User.update({ isActive: false }, { where: { id: venueOwner.userId } });
    }

    await venueOwner.destroy();

    res.json({ success: true, data: null, message: "Venue owner removed" });
  } catch (error) {
    console.error("removeVenueOwner error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// =====================================================
// VENUE ENDPOINTS FOR MULTI-ORGANIZER SYSTEM
// =====================================================

/**
 * GET /venues/all
 * Returns all venues in the system with organizer info and approval status
 * Organizers can see:
 * - Their own venues (owner)
 * - Other organizers' venues (checks approval status)
 */
exports.getAllVenues = async (req, res) => {
  try {
    // Prevent stale venue approval/listing states on wizard step 2.
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    res.removeHeader?.("ETag");
    res.removeHeader?.("Last-Modified");

    const { userId } = req.user;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    // Also include venues stored on Clubs (legacy data) so frontend sees all venues
    // Build a lookup map so VenueOwner venue IDs can resolve to the more user-friendly club venue name when available.
    const allClubs = await Club.findAll({
      where: { status: "active" },
      include: [{ model: Organization, as: 'organization', attributes: ['id', 'organizationName'] }]
    });

    const clubVenueNameById = new Map();
    allClubs.forEach((club) => {
      const venuesArray = Array.isArray(club.venues)
        ? club.venues
        : club.venues && typeof club.venues === 'object'
          ? Object.values(club.venues)
          : [];

      venuesArray.forEach((v) => {
        const vid = v.id || v.venueId;
        const vname = v.name || v.venueName;
        if (vid && vname) clubVenueNameById.set(vid, vname);
      });
    });

    // Get all venue owners:
    // - Own org's venue owners: always show (accepted OR pending invite so they can manage their own)
    // - Other orgs' venue owners: ONLY show if the invite has been accepted (real, live venue owner exists)
    let allVenueOwners = await VenueOwner.findAll({
      where: {
        [Op.or]: [
          // Own org: show all (including pending invites)
          { organizationId: organization.id },
          // Other orgs: only show accepted/registered venue owners
          {
            organizationId: { [Op.ne]: organization.id },
            isInviteAccepted: true,
          },
        ],
      },
      include: [
        {
          model: Organization,
          as: "organization",
          attributes: ["id", "organizationName", "contactPersonName", "logoUrl"],
        },
      ],
    });

    // Get all approval requests for this organization
    const { VenueApprovalRequest } = require("../models");
    const approvalRequests = await VenueApprovalRequest.findAll({
      where: { organizationId: organization.id },
    });

    // Map approval requests for quick lookup
    const approvalMap = {};
    approvalRequests.forEach((req) => {
      approvalMap[req.venueOwnerId] = req.requestStatus;
    });

    // Build response with ownership and approval status
    const venues = [];

    allVenueOwners.forEach((venueOwner) => {
      const isOwner = venueOwner.organizationId === organization.id;
      const approvalStatus = approvalMap[venueOwner.id] || null;

      // Get venue IDs array (can contain multiple venues per owner)
      const venueIdsArray = Array.isArray(venueOwner.venueIds) ? venueOwner.venueIds : [];

      if (venueIdsArray.length > 0) {
        // Create individual venue entries for each venue in venueIds
        venueIdsArray.forEach((venueId) => {
          const displayName = clubVenueNameById.get(venueId) || venueId;
          venues.push({
            id: `${venueOwner.id}:${venueId}`, // Composite ID: venueOwnerId:venueName
            name: displayName,
            address: venueOwner.address,
            phoneNumber: venueOwner.phoneNumber,
            numberOfTables: venueOwner.numberOfTables,
            facilities: venueOwner.facilities,
            openingHours: venueOwner.openingHours,
            isOwner,
            ownerOrganizationId: venueOwner.organizationId,
            ownerOrganizationName: venueOwner.organization?.organizationName || "Unknown",
            approvalStatus,
            requiresApproval: !isOwner,
            canCreateLeagueRequest: true, // VenueOwner venues can create LeagueVenueRequests
          });
        });
      } else {
        // Fallback: single venue entry using venueName or organization name
        venues.push({
          id: venueOwner.id,
          name: venueOwner.venueName || `${venueOwner.organization?.organizationName || "Unknown"} Venue`,
          address: venueOwner.address,
          phoneNumber: venueOwner.phoneNumber,
          numberOfTables: venueOwner.numberOfTables,
          facilities: venueOwner.facilities,
          openingHours: venueOwner.openingHours,
          isOwner,
          ownerOrganizationId: venueOwner.organizationId,
          ownerOrganizationName: venueOwner.organization?.organizationName || "Unknown",
          approvalStatus,
          requiresApproval: !isOwner,
          canCreateLeagueRequest: true,
        });
      }
    });

    try {
      // Also include venues stored on Clubs (legacy data) so frontend sees all venues
      // Filter to only include active clubs for THIS organization
      const myOrgClubs = allClubs.filter(
        (club) => club.organizationId === organization.id
      );

      myOrgClubs.forEach((club) => {
        const venuesArray = Array.isArray(club.venues)
          ? club.venues
          : club.venues && typeof club.venues === 'object'
            ? Object.values(club.venues)
            : [];

        venuesArray.forEach((v) => {
          const vid = v.id || v.venueId || `${club.id}:${v.name}`;
          const vname = v.name || v.venueName || `${club.name} Venue`;
          venues.push({
            id: vid,
            name: vname,
            address: v.address || '',
            phoneNumber: v.phoneNumber || '',
            numberOfTables: v.numberOfTables || null,
            facilities: v.facilities || null,
            openingHours: v.openingHours || null,
            isOwner: true, // Always own org's clubs
            ownerOrganizationId: organization.id,
            ownerOrganizationName: club.name || "Own Club",
            approvalStatus: null,
            requiresApproval: false,
            canCreateLeagueRequest: false, // Club venues cannot create LeagueVenueRequests
          });
        });
      });

      // Deduplicate by composite key (name + address)
      const seen = new Set();
      const merged = [];
      venues.forEach((v) => {
        const key = `${(v.name || '').toString().trim().toLowerCase()}::${(v.address || '').toString().trim().toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(v);
        }
      });

      return res.json({ success: true, data: merged, message: 'All venues retrieved successfully' });
    } catch (mergeErr) {
      console.error('Error merging club venues:', mergeErr);
      return res.json({ success: true, data: venues, message: 'All venues retrieved successfully' });
    }
  } catch (error) {
    console.error("getAllVenues error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};


/**
 * POST /venues/:venueOwnerId/request-approval
 * Request approval to use another organizer's venue
 */
exports.requestVenueApproval = async (req, res) => {
  try {
    const { userId } = req.user;
    const { venueOwnerId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    // Validate venue exists
    const venueOwner = await VenueOwner.findByPk(venueOwnerId);
    if (!venueOwner) {
      return res.status(404).json({ success: false, error: "Venue not found" });
    }

    // Cannot request approval for your own venue
    if (venueOwner.organizationId === organization.id) {
      return res.status(400).json({
        success: false,
        error: "Cannot request approval for your own venue",
      });
    }

    // Get VenueApprovalRequest model
    const { VenueApprovalRequest } = require("../models");

    // Check if approval request already exists
    const existingRequest = await VenueApprovalRequest.findOne({
      where: {
        organizationId: organization.id,
        venueOwnerId,
      },
    });

    if (existingRequest) {
      if (existingRequest.requestStatus === "pending") {
        return res.status(400).json({
          success: false,
          error: "Approval request already pending for this venue",
        });
      }

      if (existingRequest.requestStatus === "approved") {
        return res.status(400).json({
          success: false,
          error: "Approval already granted for this venue",
        });
      }

      // If previously rejected, allow creating a new request
      if (existingRequest.requestStatus === "rejected") {
        await existingRequest.destroy();
      }
    }

    // Create new approval request with 24-hour expiration
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const approvalRequest = await VenueApprovalRequest.create({
      organizationId: organization.id,
      venueOwnerId,
      requestStatus: "pending",
      expiresAt,
    });

    // Send approval request email to venue owner
    const { sendVenueApprovalRequest } = require("../utils/email");
    const venueOwnerUser = venueOwner.userId ? await User.findByPk(venueOwner.userId) : null;

    // Attempt to determine recipient email: prefer registered user email, then venueOwner.email, then owner org user email
    let recipientEmail = null;
    if (venueOwnerUser && venueOwnerUser.email) recipientEmail = venueOwnerUser.email;
    if (!recipientEmail && venueOwner.email) recipientEmail = venueOwner.email;
    if (!recipientEmail) {
      try {
        const ownerOrg = await Organization.findByPk(venueOwner.organizationId);
        if (ownerOrg && ownerOrg.userId) {
          const ownerOrgUser = await User.findByPk(ownerOrg.userId);
          if (ownerOrgUser && ownerOrgUser.email) recipientEmail = ownerOrgUser.email;
        }
      } catch (ownerEmailErr) {
        console.warn('Failed to resolve venue owner organization user email:', ownerEmailErr.message || ownerEmailErr);
      }
    }

    if (recipientEmail) {
      await sendVenueApprovalRequest({
        recipientEmail,
        recipientName: venueOwner.name || venueOwner.venueName || 'Venue Owner',
        venueName: venueOwner.venueName,
        organizationName: organization.organizationName,
        organizerContactEmail: (await User.findByPk(userId))?.email || "noreply@cquemetrics.com",
      });
    } else {
      console.warn(`No recipient email found for venue owner ${venueOwner.id}; approval request created but no email sent.`);
    }

    res.status(201).json({
      success: true,
      data: approvalRequest,
      message: "Approval request sent to venue owner",
    });
  } catch (error) {
    console.error("requestVenueApproval error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * GET /venues/approval-requests
 * Get pending approval requests for venues owned by this organization
 */
exports.getApprovalRequests = async (req, res) => {
  try {
    const { userId } = req.user;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const { VenueApprovalRequest, LeagueVenueRequest, League, ClubVenue, Club } = require("../models");

    // Get all venues owned by this organization that are NOT linked to pending clubs
    const myVenues = await VenueOwner.findAll({
      where: { organizationId: organization.id },
      include: [
        {
          model: ClubVenue,
          as: "clubLinks",
          required: false,
          include: [
            {
              model: Club,
              as: "club",
              where: { status: "active" }, // Only include active clubs
              required: false,
            },
          ],
        },
      ],
      attributes: { exclude: ["status"] },
    });

    // Filter manually: if a venue is linked to clubs, at least one must be active.
    // If it's not linked to any club, we'll keep it (standalone venue).
    const filteredMyVenues = myVenues.filter(v => {
      const links = v.clubLinks || [];
      if (links.length === 0) return true; // Standalone venue
      return links.some(link => link.club && link.club.status === "active");
    });

    const venueIds = filteredMyVenues.map((v) => v.id);

    // Get all general venue approval requests
    const generalRequests = await VenueApprovalRequest.findAll({
      where: {
        venueOwnerId: venueIds
      },
      include: [
        {
          model: Organization,
          as: "requestingOrganization",
          attributes: ["id", "organizationName", "contactPersonName"],
        },
        {
          model: VenueOwner,
          as: "venue",
          attributes: ["id", "venueName", "address"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // Get all league-specific venue requests
    const leagueRequests = await LeagueVenueRequest.findAll({
      where: { venueOwnerId: { [Op.in]: venueIds } },
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

    // Normalize league requests to match general request structure for frontend
    const normalizedLeagueRequests = leagueRequests.map(r => ({
      ...r.toJSON(),
      type: 'league_request',
      requestingOrganization: r.organization,
      venue: r.venueOwner,
      leagueName: r.league?.name || r.venueName,
      // Ensure status is correctly mapped if frontend expects requestStatus
      status: r.status,
    }));

    // Merge and sort
    const allRequests = [
      ...generalRequests.map(r => ({ ...r.toJSON(), type: 'general_request' })),
      ...normalizedLeagueRequests
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      data: allRequests,
      message: "Approval requests retrieved",
    });
  } catch (error) {
    console.error("===== getApprovalRequests ERROR =====");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    if (error.sql) console.error("SQL:", error.sql);
    if (error.original) console.error("Original error:", error.original.message);
    console.error("Full error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * PUT /venues/approval-requests/:requestId/approve
 * Approve a venue approval request
 */
exports.approveVenueRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { requestId } = req.params;

    const { VenueApprovalRequest, LeagueVenueRequest, User } = require("../models");

    // Try finding in VenueApprovalRequest first
    let approvalRequest = await VenueApprovalRequest.findByPk(requestId, {
      include: [
        {
          model: VenueOwner,
          as: "venue",
          attributes: ["id", "venueName", "organizationId", "userId", "name"],
        },
        {
          model: Organization,
          as: "requestingOrganization",
          attributes: ["id", "organizationName"],
        },
      ],
    });

    let isLeagueRequest = false;
    if (!approvalRequest) {
      // Try finding in LeagueVenueRequest
      approvalRequest = await LeagueVenueRequest.findByPk(requestId, {
        include: [
          {
            model: VenueOwner,
            as: "venueOwner",
            attributes: ["id", "venueName", "organizationId", "name"],
            include: [{ model: User, attributes: ["id"] }] // To get the userId if linked
          },
          {
            model: Organization,
            as: "organization",
            attributes: ["id", "organizationName"],
          },
        ],
      });
      if (approvalRequest) {
        isLeagueRequest = true;
        // Normalize for the logic below
        approvalRequest.venue = approvalRequest.venueOwner;
        approvalRequest.requestingOrganization = approvalRequest.organization;
      }
    }

    if (!approvalRequest) {
      return res.status(404).json({ success: false, error: "Request not found" });
    }

    // Verify the current user owns the venue
    const venueOwner = approvalRequest.venue;

    // Check if the user is the owner of the organization that owns the venue
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || venueOwner.organizationId !== organization.id) {
      // Check if they are directly linked as a venue owner user
      if (venueOwner.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to approve this request",
        });
      }
    }

    // Update approval request
    if (isLeagueRequest) {
      await approvalRequest.update({
        status: "approved",
      });
    } else {
      await approvalRequest.update({
        requestStatus: "approved",
        approvedAt: new Date(),
        approvedBy: userId,
      });
    }

    // Send approval email to requesting organization
    const { sendVenueApprovalEmail } = require("../utils/email");
    // Resolve requesting organization's user email
    let requestingOrgUser = null;
    try {
      const requestingOrg = await Organization.findByPk(approvalRequest.organizationId || (approvalRequest.requestingOrganization ? approvalRequest.requestingOrganization.id : null));
      if (requestingOrg && requestingOrg.userId) requestingOrgUser = await User.findByPk(requestingOrg.userId);
    } catch (resolveErr) {
      console.warn('Failed to resolve requesting organization user for approval email:', resolveErr.message || resolveErr);
    }

    if (requestingOrgUser && requestingOrgUser.email) {
      await sendVenueApprovalEmail({
        recipientEmail: requestingOrgUser.email,
        recipientName: approvalRequest.requestingOrganization?.organizationName || requestingOrgUser.email,
        venueName: venueOwner.venueName,
        venueOwnerName: venueOwner.name,
        status: "approved",
      });
    } else {
      console.warn(`No requesting organization user email found for approval request ${approvalRequest.id}; email not sent.`);
    }

    res.json({
      success: true,
      data: approvalRequest,
      message: "Venue approval granted",
    });
  } catch (error) {
    console.error("approveVenueRequest error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * PUT /venues/approval-requests/:requestId/reject
 * Reject a venue approval request
 */
exports.rejectVenueRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { requestId } = req.params;
    const { rejectionReason } = req.body;

    const { VenueApprovalRequest, LeagueVenueRequest, User } = require("../models");

    // Try finding in VenueApprovalRequest first
    let approvalRequest = await VenueApprovalRequest.findByPk(requestId, {
      include: [
        {
          model: VenueOwner,
          as: "venue",
          attributes: ["id", "venueName", "organizationId", "userId", "name"],
        },
        {
          model: Organization,
          as: "requestingOrganization",
          attributes: ["id", "organizationName"],
        },
      ],
    });

    let isLeagueRequest = false;
    if (!approvalRequest) {
      // Try finding in LeagueVenueRequest
      approvalRequest = await LeagueVenueRequest.findByPk(requestId, {
        include: [
          {
            model: VenueOwner,
            as: "venueOwner",
            attributes: ["id", "venueName", "organizationId", "name"],
          },
          {
            model: Organization,
            as: "organization",
            attributes: ["id", "organizationName"],
          },
        ],
      });
      if (approvalRequest) {
        isLeagueRequest = true;
        // Normalize for the logic below
        approvalRequest.venue = approvalRequest.venueOwner;
        approvalRequest.requestingOrganization = approvalRequest.organization;
      }
    }

    if (!approvalRequest) {
      return res.status(404).json({ success: false, error: "Request not found" });
    }

    // Verify the current user owns the venue
    const venueOwner = approvalRequest.venue;

    // Check if the user is the owner of the organization that owns the venue
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || venueOwner.organizationId !== organization.id) {
      // Check if they are directly linked as a venue owner user
      if (venueOwner.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to reject this request",
        });
      }
    }

    // Update approval request
    if (isLeagueRequest) {
      await approvalRequest.update({
        status: "rejected",
        rejectionReason: rejectionReason || null,
      });
    } else {
      await approvalRequest.update({
        requestStatus: "rejected",
        rejectedAt: new Date(),
        rejectedBy: userId,
        rejectionReason: rejectionReason || null,
      });
    }

    // Send rejection email to requesting organization
    const { sendVenueApprovalEmail } = require("../utils/email");
    // Resolve requesting organization's user email
    let requestingOrgUser = null;
    try {
      const requestingOrg = await Organization.findByPk(approvalRequest.organizationId || approvalRequest.requestingOrganization?.id);
      if (requestingOrg && requestingOrg.userId) requestingOrgUser = await User.findByPk(requestingOrg.userId);
    } catch (resolveErr) {
      console.warn('Failed to resolve requesting organization user for rejection email:', resolveErr.message || resolveErr);
    }

    if (requestingOrgUser && requestingOrgUser.email) {
      await sendVenueApprovalEmail({
        recipientEmail: requestingOrgUser.email,
        recipientName: approvalRequest.requestingOrganization?.organizationName || requestingOrgUser.email,
        venueName: venueOwner.venueName,
        venueOwnerName: venueOwner.name,
        status: "rejected",
        reason: rejectionReason,
      });
    } else {
      console.warn(`No requesting organization user email found for approval request ${approvalRequest.id}; rejection email not sent.`);
    }

    res.json({
      success: true,
      data: approvalRequest,
      message: "Venue approval request rejected",
    });
  } catch (error) {
    console.error("rejectVenueRequest error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// =====================================================
// Season Management Controllers
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

    // Validate gameId is not an object (common frontend error)
    if (typeof gameId === 'object' && gameId !== null) {
      return res.status(400).json({
        success: false,
        error: "Invalid game ID format. Please select a game from the dropdown.",
      });
    }

    // Validate gameId is a valid UUID format
    if (typeof gameId !== 'string' || !gameId.trim()) {
      return res.status(400).json({
        success: false,
        error: "Game ID must be a valid string",
      });
    }

    // Verify game exists (Check ID or Case-Insensitive Name)
    const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
    
    const game = isUUID(gameId) 
      ? await Game.findByPk(gameId)
      : await Game.findOne({
          where: sequelize.where(
            sequelize.fn('LOWER', sequelize.col('name')),
            String(gameId).toLowerCase().trim()
          ),
        });

    if (!game) {
      return res.status(404).json({
        success: false,
        error: "Game not found. Please select a valid game.",
      });
    }

    // For organization role, get organizationId from their profile
    if (role === "organization") {
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
    } else {
      return res.status(403).json({
        success: false,
        error: "Only organization users can create seasons",
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

    // Normalize dates to ensure we only store the date part
    // For DATEONLY fields, simple YYYY-MM-DD strings are best
    const normalizeToDateString = (d) => {
      if (!d) return null;
      const date = new Date(d);
      if (isNaN(date.getTime())) return null;
      // Use UTC components to get the "intended" date from an ISO string
      // or local components if it was a local-like string.
      // Since frontend sends YYYY-MM-DD, new Date() in Node treats it as UTC.
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const seasonStartDateStr = normalizeToDateString(startDate);
    const seasonEndDateStr = normalizeToDateString(endDate);

    if (!seasonStartDateStr || !seasonEndDateStr) {
      return res.status(400).json({
        success: false,
        error: "Invalid date format provided",
      });
    }

    const seasonStartDate = new Date(seasonStartDateStr);
    const seasonEndDate = new Date(seasonEndDateStr);

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
      startDate: seasonStartDateStr,
      endDate: seasonEndDateStr,
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
    const { status, page = 1, limit = 20 } = req.query;

    const where = {};

    // For organization role, get organizationId from their profile
    if (role === "organization") {
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
    } else {
      return res.status(403).json({
        success: false,
        error: "Only organization users can view seasons",
      });
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
        seasons: seasons.map(serializeSeason),
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

    // For organization role, check if season belongs to their organization
    if (role === "organization") {
      const organization = await Organization.findOne({
        where: { userId },
      });

      if (!organization || season.organizationId !== organization.id) {
        return res.status(403).json({
          success: false,
          error: "Access denied to this season",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        error: "Only organization users can access seasons",
      });
    }

    return res.status(200).json({
      success: true,
      data: serializeSeason(season),
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

    // For organization role, check if season belongs to their organization
    if (role === "organization") {
      const organization = await Organization.findOne({
        where: { userId },
      });

      if (!organization || season.organizationId !== organization.id) {
        return res.status(403).json({
          success: false,
          error: "Access denied to this season",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        error: "Only organization users can edit seasons",
      });
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
      const date = new Date(endDate);
      if (!isNaN(date.getTime())) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const newEndDateStr = `${year}-${month}-${day}`;

        // Validate endDate
        if (new Date(newEndDateStr) < new Date(season.startDate)) {
          return res.status(400).json({
            success: false,
            error: "End date must be after start date"
          });
        }

        season.endDate = newEndDateStr;
      }
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

    // For organization role, check if season belongs to their organization
    if (role === "organization") {
      const organization = await Organization.findOne({
        where: { userId },
      });

      if (!organization || season.organizationId !== organization.id) {
        return res.status(403).json({
          success: false,
          error: "Access denied to this season",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        error: "Only organization users can delete seasons",
      });
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

    const where = {};

    // For organization role, get organizationId from their profile
    if (role === "organization") {
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
    } else {
      return res.status(403).json({
        success: false,
        error: "Only organization users can access seasons",
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
      data: serializeSeason(currentSeason),
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

// ===========================
// Games Management
// ===========================

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

// ===========================
// Player Management
// ===========================

exports.getPlayers = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      console.error("getPlayers: req.user is undefined or missing userId", { user: req.user });
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { userId } = req.user;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const players = await Player.findAll({
      where: { organizationId: organization.id },
      include: [
        {
          association: "user",
          attributes: ["id", "role", "isActive"],
          required: false,
        },
      ],
      order: [["name", "ASC"]],
    });

    // Filter players with role=player on the response side
    const filteredPlayers = players.filter(p => p.user?.role === "player");

    return res.status(200).json({
      success: true,
      data: filteredPlayers,
      message: "Players retrieved successfully"
    });

  } catch (error) {
    console.error("getPlayers error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

/**
 * Get all players for an organization
 * Shows all players that could potentially be added to tournaments
 * Filters out only those already registered in the specified tournament
 *
 * Data sources (in priority order):
 * 1. Players in clubs belonging to this organization
 * 2. Players directly linked to organization (organizationId)
 * 3. All active players in the system (for broad availability)
 */
exports.getOrganizationPlayers = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { tournamentId, debug = false } = req.query;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: "Organization ID is required"
      });
    }

    const organization = await Organization.findByPk(organizationId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    console.log(`\n=== FETCHING ALL ORGANIZATION PLAYERS ===`);
    console.log(`Organization: ${organization.organizationName}`);
    if (debug) console.log(`Params: tournamentId=${tournamentId}, debug=${debug}`);

    // Collect all players from all possible sources
    let allPlayersMap = new Map(); // Use Map to deduplicate by ID
    const sourceInfo = { clubs: [], directOrg: 0, broadSearch: 0 };

    // SOURCE 1: Players from ALL clubs in this organization
    const { Club } = require("../models");
    const clubs = await Club.findAll({
      where: { organizationId },
      attributes: ["id", "name"],
    });

    console.log(`[SOURCE 1] Found ${clubs.length} club(s) in organization`);

    for (const club of clubs) {
      const clubPlayers = await Player.findAll({
        where: { clubId: club.id },
        include: [
          {
            association: "user",
            attributes: ["id", "role", "isActive", "email"],
            required: false,
          },
        ],
        raw: false,
      });

      clubPlayers.forEach(p => allPlayersMap.set(p.id, p));

      if (clubPlayers.length > 0) {
        sourceInfo.clubs.push({
          clubId: club.id,
          clubName: club.name,
          playerCount: clubPlayers.length,
        });
        console.log(`  ✓ Club "${club.name}": ${clubPlayers.length} players`);
      }
    }

    // SOURCE 2: Players with direct organizationId (not in any club)
    const directPlayers = await Player.findAll({
      where: { organizationId, clubId: null },
      include: [
        {
          association: "user",
          attributes: ["id", "role", "isActive", "email"],
          required: false,
        },
      ],
      raw: false,
    });

    directPlayers.forEach(p => allPlayersMap.set(p.id, p));
    if (directPlayers.length > 0) {
      sourceInfo.directOrg = directPlayers.length;
      console.log(`[SOURCE 2] Direct organization players: ${directPlayers.length}`);
    }

    // SOURCE 3: If we still have very few players, try broader search
    // Get all active players in the system (might belong to other orgs/clubs)
    if (allPlayersMap.size < 5) {
      console.log(`[SOURCE 3] Insufficient players found (${allPlayersMap.size}), trying broader search...`);

      const allPlayers = await Player.findAll({
        include: [
          {
            association: "user",
            attributes: ["id", "role", "isActive", "email"],
            required: false,
          },
        ],
        limit: 500, // Safety limit
        raw: false,
      });

      const beforeCount = allPlayersMap.size;
      allPlayers.forEach(p => {
        if (!allPlayersMap.has(p.id)) {
          allPlayersMap.set(p.id, p);
        }
      });
      const addedCount = allPlayersMap.size - beforeCount;

      if (addedCount > 0) {
        sourceInfo.broadSearch = addedCount;
        console.log(`  ✓ Found ${addedCount} additional players from system`);
      }
    }

    let allPlayers = Array.from(allPlayersMap.values());
    console.log(`✓ Total unique players collected: ${allPlayers.length}`);

    // Get registered players for this tournament if provided
    let registeredPlayerIds = [];
    if (tournamentId) {
      const { Tournament, TournamentParticipant } = require("../models");

      const tournament = await Tournament.findByPk(tournamentId);
      if (!tournament) {
        return res.status(404).json({
          success: false,
          error: "Tournament not found"
        });
      }

      console.log(`✓ Tournament found: "${tournament.name}"`);

      const registered = await TournamentParticipant.findAll({
        where: { tournamentId },
        attributes: ["playerId"],
        raw: true,
      });

      registeredPlayerIds = registered.map(r => r.playerId);
      console.log(`✓ Tournament has ${registeredPlayerIds.length} registered participant(s)`);

      if (debug && registeredPlayerIds.length > 0) {
        console.log(`  Registered player IDs: ${registeredPlayerIds.join(', ')}`);
      }
    }

    // Filter: Show only players NOT registered in tournament
    let availablePlayers = allPlayers.filter(p => !registeredPlayerIds.includes(p.id));

    console.log(`✓ After filtering tournament registrations: ${availablePlayers.length} available`);

    // Format response
    const formattedPlayers = availablePlayers.map(p => ({
      id: p.id,
      playerName: p.name || p.displayName || 'Unknown',
      name: p.name || p.displayName || 'Unknown',
      displayName: p.displayName || p.name,
      email: p.user?.email || 'N/A',
      handicap: p.handicap,
      skillLevel: p.skillLevel,
      status: p.status,
      clubId: p.clubId,
    }));

    console.log(`=== RETURNING ${formattedPlayers.length} PLAYERS ===\n`);

    return res.status(200).json({
      success: true,
      data: formattedPlayers,
      count: formattedPlayers.length,
      message: formattedPlayers.length === 0
        ? "No players available to add (all are already registered)"
        : `${formattedPlayers.length} player(s) available to add`,
      debug: debug ? {
        sources: sourceInfo,
        totalCollected: allPlayers.length,
        registeredInTournament: registeredPlayerIds.length,
        availableCount: formattedPlayers.length,
      } : undefined,
    });

  } catch (error) {
    console.error("getOrganizationPlayers error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
    });
  }
};

// ===========================
// Club Management
// ===========================

exports.getClubs = async (req, res) => {
  try {
    const { userId } = req.user;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const clubs = await Club.findAll({
      where: { organizationId: organization.id },
      order: [["name", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      data: clubs,
      message: "Clubs retrieved successfully"
    });

  } catch (error) {
    console.error("getClubs error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

exports.createClub = async (req, res) => {
  try {
    const { userId } = req.user;
    const { name, email, phone, address, type } = req.body;

    // Validate required fields
    if (!name || !email || !address) {
      return res.status(400).json({
        success: false,
        error: "Name, email, and address are required"
      });
    }

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const club = await Club.create({
      organizationId: organization.id,
      name,
      email,
      phone,
      address,
      type,
      isVerified: false,
    });

    return res.status(201).json({
      success: true,
      data: club,
      message: "Club created successfully"
    });

  } catch (error) {
    console.error("createClub error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

exports.updateClub = async (req, res) => {
  try {
    const { userId } = req.user;
    const { clubId } = req.params;
    const { name, email, phone, address, type } = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const club = await Club.findOne({
      where: {
        id: clubId,
        organizationId: organization.id
      }
    });

    if (!club) {
      return res.status(404).json({
        success: false,
        error: "Club not found or does not belong to your organization"
      });
    }

    await club.update({
      name: name || club.name,
      email: email || club.email,
      phone: phone !== undefined ? phone : club.phone,
      address: address || club.address,
      type: type !== undefined ? type : club.type,
    });

    return res.status(200).json({
      success: true,
      data: club,
      message: "Club updated successfully"
    });

  } catch (error) {
    console.error("updateClub error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

exports.deleteClub = async (req, res) => {
  try {
    const { userId } = req.user;
    const { clubId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const club = await Club.findOne({
      where: {
        id: clubId,
        organizationId: organization.id
      }
    });

    if (!club) {
      return res.status(404).json({
        success: false,
        error: "Club not found or does not belong to your organization"
      });
    }

    await club.destroy();

    return res.status(200).json({
      success: true,
      message: "Club deleted successfully"
    });

  } catch (error) {
    console.error("deleteClub error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};
