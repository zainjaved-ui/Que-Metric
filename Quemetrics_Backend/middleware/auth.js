const jwt = require("jsonwebtoken");
const { User, Player, Organization, VenueOwner, ClubMember } = require("../models");

// Simple LRU cache for authenticated users (reduce repeated queries)
const userCache = new Map();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const cacheUser = (userId, userData) => {
  if (userCache.size >= MAX_CACHE_SIZE) {
    const firstKey = userCache.keys().next().value;
    userCache.delete(firstKey);
  }
  userData.cachedAt = Date.now();
  userCache.set(userId, userData);
};

const getCachedUser = (userId) => {
  const cached = userCache.get(userId);
  if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL) {
    return cached;
  }
  if (cached) userCache.delete(userId);
  return null;
};

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const err = new Error("No token provided");
      err.status = 401;
      return next(err);
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check cache first before querying database
    let userData = getCachedUser(decoded.userId);

    if (!userData) {
      const user = await User.findByPk(decoded.userId, {
        attributes: ['id', 'email', 'role', 'status', 'emailVerified', 'isActive']
      });
      if (!user || !user.isActive) {
        const err = new Error("User not found or inactive");
        err.status = 401;
        return next(err);
      }

      const [playerProfile, organizationProfile, venueOwnerProfile, clubMemberships] = await Promise.all([
        Player.findOne({ where: { userId: user.id }, attributes: ["id"] }),
        Organization.findOne({ where: { userId: user.id }, attributes: ["id"] }),
        VenueOwner.findOne({ where: { userId: user.id }, attributes: ["id"] }),
        ClubMember.findAll({ where: { userId: user.id, status: "active" }, attributes: ["clubId", "role"] }),
      ]);

      const roles = new Set([user.role]);
      if (playerProfile) roles.add("player");
      if (organizationProfile) roles.add("organization");
      if (venueOwnerProfile) roles.add("venue_owner");

      const clubRoles = {};
      for (const m of clubMemberships) {
        if (!clubRoles[m.clubId]) clubRoles[m.clubId] = [];
        clubRoles[m.clubId].push(m.role);
        roles.add(m.role);
      }

      userData = {
        userId: user.id,
        email: user.email,
        primaryRole: user.role,
        role: user.role,
        roles: Array.from(roles),
        clubRoles,
        status: user.status,
        emailVerified: user.emailVerified,
        hasPlayerProfile: !!playerProfile,
      };
      cacheUser(decoded.userId, userData);
    } else if (
      typeof userData.hasPlayerProfile === "undefined" ||
      !Array.isArray(userData.roles) ||
      typeof userData.clubRoles !== "object"
    ) {
      // Backfill cached entries created before multi-role payload existed.
      const [user, playerProfile, organizationProfile, venueOwnerProfile, clubMemberships] = await Promise.all([
        User.findByPk(decoded.userId, { attributes: ["role"] }),
        Player.findOne({ where: { userId: decoded.userId }, attributes: ["id"] }),
        Organization.findOne({ where: { userId: decoded.userId }, attributes: ["id"] }),
        VenueOwner.findOne({ where: { userId: decoded.userId }, attributes: ["id"] }),
        ClubMember.findAll({ where: { userId: decoded.userId, status: "active" }, attributes: ["clubId", "role"] }),
      ]);

      const roles = new Set([userData.role || user?.role || "player"]);
      if (playerProfile) roles.add("player");
      if (organizationProfile) roles.add("organization");
      if (venueOwnerProfile) roles.add("venue_owner");

      const clubRoles = {};
      for (const m of clubMemberships) {
        if (!clubRoles[m.clubId]) clubRoles[m.clubId] = [];
        clubRoles[m.clubId].push(m.role);
        roles.add(m.role);
      }

      userData.hasPlayerProfile = !!playerProfile;
      userData.roles = Array.from(roles);
      userData.clubRoles = clubRoles;
      cacheUser(decoded.userId, userData);
    }

    // JWT carries the active login context (e.g. venue_owner) while `users.role` may still be
    // another value when the account has multiple profiles. Prefer token role for authorization.
    if (decoded.role) {
      userData = { ...userData, role: decoded.role };
    }

    req.user = userData;
    req.user._cached = true; // Flag to indicate this came from cache
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      const err = new Error("Token expired");
      err.status = 401;
      err.code = "TOKEN_EXPIRED";
      return next(err);
    }
    const err = new Error("Invalid token");
    err.status = 401;
    err.code = "INVALID_TOKEN";
    return next(err);
  }
};

const requireVerifiedAccount = async (req, res, next) => {
  try {
    if (!req.user) {
      const err = new Error("Not authenticated");
      err.status = 401;
      return next(err);
    }

    if (req.user.status === "Pending" || !req.user.emailVerified) {
      const err = new Error("Please verify your email address before accessing this feature");
      err.status = 403;
      err.requiresVerification = true;
      return next(err);
    }

    if (req.user.status === "Suspended") {
      const err = new Error("Your account is suspended. Please contact support.");
      err.status = 403;
      return next(err);
    }

    if (req.user.status === "Inactive") {
      const err = new Error("Your account is inactive. Please contact support to reactivate.");
      err.status = 403;
      return next(err);
    }

    if (req.user.status === "Anonymised") {
      const err = new Error("This account has been anonymised and cannot be accessed.");
      err.status = 403;
      return next(err);
    }

    next();
  } catch (error) {
    console.error("requireVerifiedAccount error:", error);
    const err = new Error("Internal server error");
    err.status = 500;
    next(err);
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      const err = new Error("Not authenticated");
      err.status = 401;
      return next(err);
    }

    const { role } = req.user;
    const roleSet = new Set([role, ...(Array.isArray(req.user.roles) ? req.user.roles : [])]);

    // Super admins have access everywhere
    if (role === "super_admin") {
      return next();
    }

    const canActAsPlayer =
      roles.includes("player") && req.user.hasPlayerProfile === true;

    const hasRequiredRole = roles.some((r) => roleSet.has(r));

    if (!hasRequiredRole && !canActAsPlayer) {
      const err = new Error("Access denied");
      err.status = 403;
      return next(err);
    }

    next();
  };
};

module.exports = { authenticate, requireVerifiedAccount, requireRole };