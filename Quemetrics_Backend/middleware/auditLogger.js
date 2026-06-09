const { AuditLog } = require("../models");

/**
 * Audit logging middleware - logs admin/org actions to AuditLog table
 * @param {string} action - The action being performed (e.g., 'league_created', 'tournament_updated')
 * @param {string} entityType - The type of entity (e.g., 'league', 'tournament', 'organization')
 * @returns {Function} Express middleware
 */
const auditLog = (action, entityType) => {
  return async (req, res, next) => {
    // Store original res.json
    const originalJson = res.json.bind(res);

    // Capture old value for updates/deletes
    const oldValue = req.oldValue || null;

    res.json = async (data) => {
      // Only log if response was successful (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          await AuditLog.create({
            userId: req.user?.id || null,
            action: action,
            entityType: entityType,
            entityId: req.params?.leagueId || req.params?.tournamentId || req.params?.organizationId || data?.data?.id || null,
            oldValue: oldValue ? JSON.stringify(oldValue) : null,
            newValue: data?.data ? JSON.stringify(data.data) : null,
            ipAddress: req.ip || req.connection?.remoteAddress || null,
            userAgent: req.headers["user-agent"] || null,
          });
        } catch (err) {
          // Don't block the response if logging fails
          console.error("Audit log error:", err.message);
        }
      }
      return originalJson(data);
    };

    next();
  };
};

/**
 * Middleware to capture old value before update/delete
 * @param {Function} getEntity - Async function to fetch entity (receives req)
 * @returns {Function} Express middleware
 */
const captureOldValue = (getEntity) => {
  return async (req, res, next) => {
    try {
      const entity = await getEntity(req);
      if (entity) {
        req.oldValue = entity.toJSON ? entity.toJSON() : entity;
      }
    } catch (err) {
      console.error("Capture old value error:", err.message);
    }
    next();
  };
};

module.exports = { auditLog, captureOldValue };
