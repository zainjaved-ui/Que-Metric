const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { User, Player, Organization, EmailVerification, VenueOwner, Club, ClubMember } = require("../models");
const sequelize = require("../config/db");
const { sendPasswordResetEmail, sendEmailVerification } = require("../utils/email");

// ✅ In-memory store for temporary role-selection tokens (expires after 5 minutes)
// Format: { [tempToken]: { userId, availableRoles, createdAt } }
const roleSelectionTokenStore = new Map();

const generateSlug = (name) => {
  const base = String(name || "club")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "club";
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
};

const generateJoinCode = () => crypto.randomBytes(4).toString("hex").toUpperCase();
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

// ✅ Generate a temporary token for role selection (5 minute expiry)
const generateRoleSelectionToken = (userId, availableRoles) => {
  const tempToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  roleSelectionTokenStore.set(tempToken, {
    userId,
    availableRoles,
    expiresAt,
  });

  // Auto-cleanup expired tokens
  setTimeout(() => {
    roleSelectionTokenStore.delete(tempToken);
  }, 5 * 60 * 1000);

  return tempToken;
};

// ✅ Verify and retrieve temporary role selection token
const verifyRoleSelectionToken = (tempToken) => {
  const tokenData = roleSelectionTokenStore.get(tempToken);

  if (!tokenData) {
    return null;
  }

  if (Date.now() > tokenData.expiresAt) {
    roleSelectionTokenStore.delete(tempToken);
    return null;
  }

  return tokenData;
};

const generateTokens = (userId, role = "player") => {
  const accessToken = jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  });
  const refreshToken = jwt.sign({ userId, role }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });
  return { accessToken, refreshToken };
};

exports.registerPlayer = async (req, res) => {
  try {
    const {
      email: rawEmail,
      password,
      name,
      organizationId,
      dateOfBirth,
      experienceLevel,
      address,
      mobileNumber,
      bio,
    } = req.body;
    const email = normalizeEmail(rawEmail);

    // STEP 1: Validate date of birth BEFORE creating anything
    if (dateOfBirth) {
      const dob = new Date(dateOfBirth);
      const age = Math.floor((new Date() - dob) / (365.25 * 24 * 60 * 60 * 1000));

      if (age < 10 || age > 100) {
        return res.status(400).json({
          success: false,
          error: "Invalid date of birth. Age must be between 10 and 100."
        });
      }
    }

    // STEP 2: Check for existing user — prevent duplicates and role conflicts
    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      // Check if they already have a player profile
      const existingPlayer = await Player.findOne({ where: { userId: existingUser.id } });
      if (existingPlayer) {
        return res.status(400).json({ success: false, error: 'An account with this email already exists. Please log in instead.' });
      }

      // User exists with a different role (organization/venue_owner) but already has a player profile
      // created during org registration. Block re-registration — they should log in.
      return res.status(400).json({
        success: false,
        error: 'This email is already registered as an organizer. Please log in to access your player profile.'
      });
    }

    // STEP 3: Validate organization exists (if provided)
    if (organizationId) {
      const organization = await Organization.findByPk(organizationId);
      if (!organization) {
        return res.status(404).json({ success: false, error: "Organization not found" });
      }
    }

    // STEP 4: Create new user account
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      email,
      password: hashedPassword,
      role: "player",
      status: "Active",
      emailVerified: false,
    });

    // STEP 5: Create player profile with badgeType "Casual"
    const [player] = await Player.upsert({
      userId: user.id,
      organizationId: organizationId || null,
      name,
      dateOfBirth: dateOfBirth || null,
      experienceLevel: experienceLevel || null,
      address: address || null,
      mobileNumber: mobileNumber || null,
      bio: bio || null,
      badgeType: "Casual",
    });

    // STEP 4: Generate verification token and send email
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(verificationToken).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await EmailVerification.create({
      userId: user.id,
      token: hashedToken,
      expiresAt,
    });

    // Send verification email
    await sendEmailVerification({
      email,
      name,
      verificationToken,
      frontendUrl: req.headers.origin,
    });

    // STEP 5: Generate tokens for auto-login (as player)
    const { accessToken, refreshToken } = generateTokens(user.id, "player");
    await user.update({ refreshToken, lastLogin: new Date() });

    res.status(201).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          playerId: player.id,
          email: user.email,
          role: user.role,
          status: user.status,
          emailVerified: user.emailVerified,
        },
        player: {
          id: player.id,
          name: player.name,
          badgeType: player.badgeType,
        },
      },
      message: "Registration successful! You can now access your dashboard. Please verify your email to unlock all features.",
    });
  } catch (error) {
    if (error?.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        error: "An account with this email already exists. Please log in instead.",
      });
    }

    console.error("registerPlayer error:", error);
    console.error("Error details:", {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });

    // Return detailed error in development mode
    const errorMessage = process.env.NODE_ENV === "development"
      ? error.message
      : "Internal server error";

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

exports.registerOrganization = async (req, res) => {
  // Use a transaction so User + Organization + Player are created atomically.
  // If any step fails the whole registration rolls back — no orphaned records.
  const t = await sequelize.transaction();
  try {
    const { email: rawEmail, password, organizationName, contactPersonName, phoneNumber } = req.body;
    const email = normalizeEmail(rawEmail);

    const existingUser = await User.findOne({ where: { email }, transaction: t });

    if (existingUser) {
      // Check if they already have an organization profile
      const existingOrg = await Organization.findOne({ where: { userId: existingUser.id }, transaction: t });
      if (existingOrg) {
        await t.rollback();
        return res.status(400).json({ success: false, error: 'An account with this email is already registered as an organization. Please log in instead.' });
      }

      // User exists with a different role (player/venue_owner) — block cross-role registration
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: 'This email is already registered. Please log in and contact support to add an organization role.'
      });
    }

    // Create a new user account with organization role
    const hashedPassword = await bcrypt.hash(password, 12);
    const organizationUser = await User.create({
      email,
      password: hashedPassword,
      role: "organization",
      status: "Pending",
      emailVerified: false,
    }, { transaction: t });

    // STEP 2: Create organization record
    const org = await Organization.create({
      userId: organizationUser.id,
      organizationName,
      contactPersonName,
      phoneNumber,
      isVerified: false,
    }, { transaction: t });

    // STEP 2b: Auto-create a Player profile so the organizer can also participate as a player.
    // We use a raw INSERT (with uuid()) instead of findOrCreate to avoid ORM type-casting
    // issues with the UUID primary key and the userId CHAR(36) column.
    let playerProfile = await Player.findOne({ where: { userId: organizationUser.id }, transaction: t });
    if (!playerProfile) {
      const playerId = require("crypto").randomUUID();
      await sequelize.query(
        `INSERT INTO players (id, userId, name, phoneNumber, badgeType, createdAt, updatedAt)
         VALUES (:id, :userId, :name, :phoneNumber, 'Casual', NOW(), NOW())`,
        {
          replacements: {
            id: playerId,
            userId: organizationUser.id,
            name: contactPersonName,
            phoneNumber: phoneNumber || null,
          },
          type: sequelize.QueryTypes.INSERT,
          transaction: t,
        }
      );
      playerProfile = await Player.findOne({ where: { userId: organizationUser.id }, transaction: t });
    }

    console.log(`[registerOrganization] Player profile id=${playerProfile.id} linked to user ${organizationUser.id}`);

    // Ensure organization is explicitly linked to a club from day one.
    const autoClub = await Club.create({
      organizationId: org.id,
      name: organizationName,
      slug: generateSlug(organizationName),
      email,
      phone: phoneNumber || "N/A",
      address: `${organizationName} HQ`,
      contactPerson: contactPersonName,
      sportType: "multi-sport",
      sportTypes: ["snooker", "pool", "pooker"],
      visibility: "private",
      status: "pending",
      createdBy: organizationUser.id,
      memberCount: 1,
      isVerified: false,
      verificationNote: "Auto-created from organization registration",
      joinSettings: {
        method: "invite",
        requireApproval: true,
        joinCode: generateJoinCode(),
        codeExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    }, { transaction: t });

    await ClubMember.create({
      clubId: autoClub.id,
      userId: organizationUser.id,
      playerId: playerProfile.id,
      role: "club_admin",
      status: "active",
      joinMethod: "created",
      joinedAt: new Date(),
    }, { transaction: t });

    // STEP 3: Generate verification token and send email
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(verificationToken).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await EmailVerification.create({
      userId: organizationUser.id,
      token: hashedToken,
      expiresAt,
    }, { transaction: t });

    // Commit all DB changes before sending the email
    await t.commit();

    // Send verification email (outside transaction — email failure won't roll back DB)
    try {
      await sendEmailVerification({
        email,
        name: organizationName,
        verificationToken,
        frontendUrl: req.headers.origin,
      });
    } catch (emailError) {
      console.error("[registerOrganization] Verification email failed to send:", emailError.message);
      // Registration is still successful even if email fails
    }

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: organizationUser.id,
          email: organizationUser.email,
          role: organizationUser.role,
          status: organizationUser.status,
          emailVerified: organizationUser.emailVerified,
          organizationId: org.id,
          organizationName: org.organizationName,
          playerId: playerProfile.id,
          clubId: autoClub.id,
        },
        organization: {
          id: org.id,
          organizationName: org.organizationName,
        },
        club: {
          id: autoClub.id,
          name: autoClub.name,
        },
        player: {
          id: playerProfile.id,
          name: playerProfile.name || contactPersonName,
        },
        availableRoles: [
          {
            role: "organization",
            id: organizationUser.id,
            organizationId: org.id,
            organizationName: org.organizationName,
          },
          {
            role: "player",
            id: organizationUser.id,
            playerId: playerProfile.id,
            playerName: playerProfile.name || contactPersonName,
          },
        ],
      },
      message: "Organization registration successful! You have been registered with both Organization and Player profiles. Please check your email to verify your account.",
    });
  } catch (error) {
    await t.rollback().catch(() => {});  // rollback if not already committed
    if (error?.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        error: "An account with this email already exists. Please log in instead.",
      });
    }

    console.error("registerOrganization error:", error);
    console.error("Error details:", {
      message: error.message,
      name: error.name,
      code: error.code,
    });

    // Log full error for debugging
    if (error.name === "SequelizeValidationError" || error.name === "SequelizeUniqueConstraintError") {
      console.error("Validation/Constraint errors:", JSON.stringify(error.errors || error, null, 2));
    }

    // Return detailed error in development mode
    let errorMessage = "Internal server error";

    if (error.name === "SequelizeValidationError") {
      const errors = error.errors || [];
      if (errors.length > 0) {
        errorMessage = errors.map(e => e.message).join(", ");
      } else {
        errorMessage = error.message;
      }
    } else if (process.env.NODE_ENV === "development") {
      errorMessage = error.message;
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, error: "Verification token is required" });
    }

    // Hash the token to compare with database
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find ALL verification records with this token (could be multiple for same email)
    const verifications = await EmailVerification.findAll({
      where: { token: hashedToken, used: false },
    });

    if (!verifications || verifications.length === 0) {
      return res.status(400).json({ success: false, error: "Invalid or already used verification token" });
    }

    // Check if expired (check first one; they all have same expiry)
    if (new Date() > verifications[0].expiresAt) {
      return res.status(400).json({ success: false, error: "Verification token has expired. Please request a new one." });
    }

    // STEP 6: Email Verified - Activate ALL accounts with this token
    const userIds = verifications.map(v => v.userId);
    const users = await User.findAll({ where: { id: userIds } });

    if (!users || users.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Update all users to Active status
    for (const user of users) {
      await user.update({
        status: "Active",
        emailVerified: true,
        lastLogin: new Date(),
      });
      console.log(`[verifyEmail] User ${user.id} (${user.role}) email verified and activated`);
    }

    // Mark all verifications as used
    for (const verification of verifications) {
      await verification.update({ used: true });
    }

    // Get primary user for the response
    const primaryUser = users[0];

    // Get all roles that were activated
    const activatedRoles = users.map(u => u.role);

    res.json({
      success: true,
      message: activatedRoles.length > 1
        ? `Email verified successfully! ${activatedRoles.length} profiles activated: ${activatedRoles.join(', ')}. You can now login.`
        : "Email verified successfully! Your account is now active. Please login to continue.",
      data: {
        email: primaryUser.email,
        activatedRoles,
      },
    });
  } catch (error) {
    console.error("verifyEmail error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.resendVerification = async (req, res) => {
  try {
    const { email: rawEmail } = req.body;
    const email = normalizeEmail(rawEmail);

    const users = await User.findAll({ where: { email } });
    if (!users || users.length === 0) {
      // Don't reveal if email exists
      return res.json({ success: true, message: "If the email exists and is unverified, a new verification link has been sent." });
    }

    const unverifiedUsers = users.filter((u) => !u.emailVerified);
    if (unverifiedUsers.length === 0) {
      return res.status(400).json({ success: false, error: "Email is already verified" });
    }

    // Invalidate old verification tokens for all unverified profiles under this email.
    const unverifiedUserIds = unverifiedUsers.map((u) => u.id);
    await EmailVerification.update(
      { used: true },
      { where: { userId: unverifiedUserIds, used: false } }
    );

    // Generate one verification token that can activate all unverified profiles with this email.
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(verificationToken).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await EmailVerification.bulkCreate(
      unverifiedUserIds.map((userId) => ({
        userId,
        token: hashedToken,
        expiresAt,
      }))
    );

    // Resolve a friendly display name for email content.
    const primaryUser = unverifiedUsers[0];
    const [playerProfile, organizationProfile] = await Promise.all([
      Player.findOne({ where: { userId: primaryUser.id } }),
      Organization.findOne({ where: { userId: primaryUser.id } }),
    ]);
    const recipientName =
      playerProfile?.name ||
      organizationProfile?.contactPersonName ||
      organizationProfile?.organizationName ||
      email;

    // Send verification email
    const emailResult = await sendEmailVerification({
      email,
      name: recipientName,
      verificationToken,
      frontendUrl: req.headers.origin,
    });

    if (!emailResult.success) {
      console.error("[resendVerification] Failed to send email:", emailResult.error);
    }

    res.json({
      success: true,
      message: "If the email exists and is unverified, a new verification link has been sent.",
    });
  } catch (error) {
    console.error("resendVerification error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email: rawEmail, password, role } = req.body;
    const email = normalizeEmail(rawEmail);
    // const { email, password, role } = req.body;

    // STEP 1: Find user by email (one record per email)
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    // // STEP 2: Verify password
    // const isPasswordValid = await bcrypt.compare(password, user.password);
    // if (!isPasswordValid) {
    //   return res.status(401).json({ success: false, error: "Invalid email or password" });
    // }

    // STEP 3: Check email verification
    if (!user.emailVerified) {
      return res.status(401).json({
        success: false,
        error: "Please verify your email before logging in",
        requiresEmailVerification: true,
        email: user.email
      });
    }

    // STEP 4: Check account status
    if (user.status === "Suspended") {
      return res.status(403).json({ success: false, error: "Account is suspended. Please contact support." });
    }
    if (user.status === "Anonymised") {
      return res.status(403).json({ success: false, error: "This account has been anonymised." });
    }

    // STEP 5: Detect available role contexts for this user
    // Always check for BOTH organization and player profiles regardless of stored role
    const availableRoles = [];
    let orgProfile = null;
    let playerProfile = null;

    // Always look for all profile types
    orgProfile = await Organization.findOne({
      where: { userId: user.id },
      attributes: ["id", "organizationName"],
    });
    playerProfile = await Player.findOne({
      where: { userId: user.id },
      attributes: ["id", "name", "badgeType"],
    });
    const venueOwnerProfile = await VenueOwner.findOne({
      where: { userId: user.id },
      attributes: ["id", "name", "venueName"],
    });

    if (orgProfile) {
      availableRoles.push({
        role: "organization",
        id: user.id,
        organizationId: orgProfile.id,
        organizationName: orgProfile.organizationName,
      });
    }

    if (playerProfile) {
      availableRoles.push({
        role: "player",
        id: user.id,
        playerId: playerProfile.id,
        playerName: playerProfile.name,
      });
    }

    if (venueOwnerProfile) {
      availableRoles.push({
        role: "venue_owner",
        id: user.id,
        venueOwnerId: venueOwnerProfile.id,
        venueOwnerName: venueOwnerProfile.name,
      });
    }

    // Fallback: if no profiles found, use stored role
    if (availableRoles.length === 0) {
      availableRoles.push({ role: user.role, id: user.id });
    }

    // STEP 5: If multiple contexts and no role selected → generate temporary token
    if (availableRoles.length > 1 && !role) {
      // ✅ Generate temporary token for role selection (valid for 5 minutes)
      const roleSelectionToken = generateRoleSelectionToken(user.id, availableRoles);
      console.log('[login] Generated roleSelectionToken:', roleSelectionToken ? roleSelectionToken.substring(0, 10) + '...' : 'UNDEFINED');

      const response = {
        success: true,
        requiresRoleSelection: true,
        roleSelectionToken,              // ← Frontend sends this back instead of password
        availableRoles,
        email,
        message: "You have multiple profiles. Please select which role to log in as.",
      };

      console.log('[login] Response keys:', Object.keys(response));
      console.log('[login] Has roleSelectionToken in response?', 'roleSelectionToken' in response);

      return res.json(response);
    }

    // STEP 6: Determine active context
    // Use selected role, or single available role, or fall back to stored role
    const activeRole = role || (availableRoles.length === 1 ? availableRoles[0].role : user.role);

    // Build the user response object based on active context
    let userData = {
      id: user.id,
      email: user.email,
      role: activeRole,           // reflects the chosen context
      primaryRole: user.role,     // always the real DB role
      status: user.status,
      emailVerified: user.emailVerified,
      playerId: playerProfile?.id || null,
      organizationId: orgProfile?.id || null,
      venueOwnerId: venueOwnerProfile?.id || null,
    };

    if (activeRole === "organization" && orgProfile) {
      userData.organizationName = orgProfile.organizationName;
    }
    if (activeRole === "player" && playerProfile) {
      userData.playerName = playerProfile.name;
      userData.badgeType = playerProfile.badgeType;
    }
    if (activeRole === "venue_owner" && venueOwnerProfile) {
      userData.venueOwnerName = venueOwnerProfile.name;
      userData.venueName = venueOwnerProfile.venueName;
    }

    // Always expose available roles so frontend can offer switching
    userData.availableRoles = availableRoles;

    // STEP 7: Generate tokens with activeRole included in JWT
    const { accessToken, refreshToken } = generateTokens(user.id, activeRole);
    await user.update({ refreshToken, lastLogin: new Date() });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: userData,
      },
      message: "Login successful",
    });
  } catch (error) {
    console.error("[LOGIN] Error full details:", {
      message: error.message,
      stack: error.stack,
      email: req.body?.email,
      code: error.code
    });
    res.status(500).json({ success: false, error: "Internal server error", details: error.message });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ success: false, error: "Refresh token required" });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findByPk(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, error: "Invalid refresh token" });
    }

    // Use the role from the decoded refresh token, fallback to user's database role
    const role = decoded.role || user.role || "player";
    const accessToken = jwt.sign({ userId: user.id, role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    });

    res.json({
      success: true,
      data: { accessToken },
      message: "Token refreshed successfully",
    });
  } catch (error) {
    // Distinguish between different error types for better client-side handling
    if (error.name === "TokenExpiredError") {
      console.error("refreshToken error: Refresh token expired", error.message);
      return res.status(401).json({
        success: false,
        error: "Refresh token expired. Please log in again.",
        code: "REFRESH_TOKEN_EXPIRED"
      });
    }

    console.error("refreshToken error:", error.message);
    res.status(401).json({
      success: false,
      error: "Invalid refresh token",
      code: "INVALID_REFRESH_TOKEN"
    });
  }
};

exports.logout = async (req, res) => {
  try {
    const { userId } = req.user;
    await User.update({ refreshToken: null }, { where: { id: userId } });

    res.json({ success: true, data: null, message: "Logged out successfully" });
  } catch (error) {
    console.error("logout error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email: rawEmail } = req.body;
    const email = normalizeEmail(rawEmail);

    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Return success regardless to avoid email enumeration
      return res.json({ success: true, data: null, message: "If email exists, reset link will be sent" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    const resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await user.update({ resetPasswordToken, resetPasswordExpires });

    // Send password reset email
    const emailResult = await sendPasswordResetEmail({ email, resetToken });

    if (!emailResult.success) {
      console.error("Failed to send reset email:", emailResult.error);
    }

    res.json({ success: true, data: null, message: "If email exists, reset link will be sent" });
  } catch (error) {
    console.error("forgotPassword error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    // Find first user with this token to validate it
    const user = await User.findOne({
      where: {
        resetPasswordToken: hashedToken,
      },
    });

    if (!user || new Date() > user.resetPasswordExpires) {
      return res.status(400).json({ success: false, error: "Invalid or expired reset token" });
    }

    // Check if new password is the same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ success: false, error: "New password cannot be the same as your old password." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await user.update({
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });

    res.json({ success: true, data: null, message: "Password reset successfully" });
  } catch (error) {
    console.error("resetPassword error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, error: "Current password is incorrect" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, error: "New password cannot be the same as your current password." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update ALL users with this email (handles multiple profiles like player/organization)
    await User.update(
      { password: hashedPassword },
      { where: { email: user.email } }
    );

    res.json({ success: true, data: null, message: "Password changed successfully" });
  } catch (error) {
    console.error("changePassword error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.getNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findByPk(userId, {
      attributes: ["id", "email", "notificationPreferences"],
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({
      success: true,
      data: {
        email: user.email,
        notificationPreferences: user.notificationPreferences,
      },
    });
  } catch (error) {
    console.error("getNotificationPreferences error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.updateNotificationPreferences = async (req, res) => {
  try {
    const { tournamentInvites } = req.body;
    const userId = req.user.userId;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // System notifications cannot be opted out
    const notificationPreferences = {
      tournamentInvites: tournamentInvites !== false,
      systemNotifications: true,
    };

    await user.update({ notificationPreferences });

    res.json({
      success: true,
      data: { notificationPreferences },
      message: "Notification preferences updated",
    });
  } catch (error) {
    console.error("updateNotificationPreferences error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user.userId;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, error: "Password is incorrect" });
    }

    // Soft delete - deactivate account instead of hard delete
    await user.update({ isActive: false, refreshToken: null });

    res.json({ success: true, data: null, message: "Account deleted successfully" });
  } catch (error) {
    console.error("deleteAccount error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ✅ NEW ENDPOINT: Confirm role selection using temporary token (No password needed)
exports.confirmRoleSelection = async (req, res) => {
  try {
    const { roleSelectionToken, role } = req.body;

    if (!roleSelectionToken || !role) {
      return res.status(400).json({
        success: false,
        error: "Role selection token and role are required"
      });
    }

    // ✅ STEP 1: Verify temporary token
    const tokenData = verifyRoleSelectionToken(roleSelectionToken);
    if (!tokenData) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired role selection token. Please login again."
      });
    }

    const userId = tokenData.userId;

    // ✅ STEP 2: Verify selected role is in available roles
    const selectedRoleData = tokenData.availableRoles.find(r => r.role === role);
    if (!selectedRoleData) {
      return res.status(400).json({
        success: false,
        error: "Invalid role selection"
      });
    }

    // ✅ STEP 3: Fetch user and all profile data
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Fetch all profiles
    const orgProfile = await Organization.findOne({
      where: { userId: user.id },
      attributes: ["id", "organizationName"],
    });
    const playerProfile = await Player.findOne({
      where: { userId: user.id },
      attributes: ["id", "name", "badgeType"],
    });
    const venueOwnerProfile = await VenueOwner.findOne({
      where: { userId: user.id },
      attributes: ["id", "name", "venueName"],
    });

    // ✅ STEP 4: Build user response
    let userData = {
      id: user.id,
      email: user.email,
      role,                              // ← The selected role
      primaryRole: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      playerId: playerProfile?.id || null,
      organizationId: orgProfile?.id || null,
      venueOwnerId: venueOwnerProfile?.id || null,
      availableRoles: tokenData.availableRoles,
    };

    if (role === "organization" && orgProfile) {
      userData.organizationName = orgProfile.organizationName;
    }
    if (role === "player" && playerProfile) {
      userData.playerName = playerProfile.name;
      userData.badgeType = playerProfile.badgeType;
    }
    if (role === "venue_owner" && venueOwnerProfile) {
      userData.venueOwnerName = venueOwnerProfile.name;
      userData.venueName = venueOwnerProfile.venueName;
    }

    // ✅ STEP 5: Generate JWT tokens
    const { accessToken, refreshToken } = generateTokens(user.id, role);
    await user.update({ refreshToken, lastLogin: new Date() });

    // ✅ STEP 6: Delete the temporary token
    roleSelectionTokenStore.delete(roleSelectionToken);

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: userData,
      },
      message: "Login successful",
    });
  } catch (error) {
    console.error("[confirmRoleSelection] Error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

exports.switchRole = async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.user?.userId;

    if (!userId || !role) {
      return res.status(400).json({
        success: false,
        error: "User and target role are required"
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (user.status === "Suspended") {
      return res.status(403).json({ success: false, error: "Account is suspended. Please contact support." });
    }
    if (user.status === "Anonymised") {
      return res.status(403).json({ success: false, error: "This account has been anonymised." });
    }

    const orgProfile = await Organization.findOne({
      where: { userId: user.id },
      attributes: ["id", "organizationName"],
    });
    const playerProfile = await Player.findOne({
      where: { userId: user.id },
      attributes: ["id", "name", "badgeType"],
    });
    const venueOwnerProfile = await VenueOwner.findOne({
      where: { userId: user.id },
      attributes: ["id", "name", "venueName"],
    });

    const availableRoles = [];
    if (orgProfile) {
      availableRoles.push({
        role: "organization",
        id: user.id,
        organizationId: orgProfile.id,
        organizationName: orgProfile.organizationName,
      });
    }
    if (playerProfile) {
      availableRoles.push({
        role: "player",
        id: user.id,
        playerId: playerProfile.id,
        playerName: playerProfile.name,
      });
    }
    if (venueOwnerProfile) {
      availableRoles.push({
        role: "venue_owner",
        id: user.id,
        venueOwnerId: venueOwnerProfile.id,
        venueOwnerName: venueOwnerProfile.name,
      });
    }

    if (availableRoles.length === 0) {
      availableRoles.push({ role: user.role, id: user.id });
    }

    const selectedRoleData = availableRoles.find((item) => item.role === role);
    if (!selectedRoleData) {
      return res.status(400).json({ success: false, error: "Invalid role selection" });
    }

    let userData = {
      id: user.id,
      email: user.email,
      role,
      primaryRole: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      playerId: playerProfile?.id || null,
      organizationId: orgProfile?.id || null,
      venueOwnerId: venueOwnerProfile?.id || null,
      availableRoles,
    };

    if (role === "organization" && orgProfile) {
      userData.organizationName = orgProfile.organizationName;
    }
    if (role === "player" && playerProfile) {
      userData.playerName = playerProfile.name;
      userData.badgeType = playerProfile.badgeType;
    }
    if (role === "venue_owner" && venueOwnerProfile) {
      userData.venueOwnerName = venueOwnerProfile.name;
      userData.venueName = venueOwnerProfile.venueName;
    }

    const { accessToken, refreshToken } = generateTokens(user.id, role);
    await user.update({ refreshToken, lastLogin: new Date() });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: userData,
      },
      message: "Role switched successfully",
    });
  } catch (error) {
    console.error("[switchRole] Error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
