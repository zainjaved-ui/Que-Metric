const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const matchResultController = require("../controllers/matchResultController");
const { authenticate, requireRole } = require("../middleware/auth");
const { validate, schemas } = require("../middleware/validate");
const { auditLog, captureOldValue } = require("../middleware/auditLogger");
const { Organization } = require("../models");

// Helper to get organization by ID for audit logging
const getOrganizationById = async (req) => {
  return await Organization.findByPk(req.params.organizationId);
};

router.get(
  "/organizations/pending",
  authenticate,
  requireRole("super_admin"),
  adminController.getPendingOrganizations
);

router.post(
  "/organizations/:organizationId/approve",
  authenticate,
  requireRole("super_admin"),
  captureOldValue(getOrganizationById),
  auditLog("organization_approved", "organization"),
  adminController.approveOrganization
);

router.post(
  "/organizations/:organizationId/reject",
  authenticate,
  requireRole("super_admin"),
  validate(schemas.rejectOrganization),
  captureOldValue(getOrganizationById),
  auditLog("organization_rejected", "organization"),
  adminController.rejectOrganization
);

router.get(
  "/organizations",
  authenticate,
  requireRole("super_admin"),
  adminController.getAllOrganizations
);

router.get(
  "/players",
  authenticate,
  requireRole("super_admin"),
  adminController.getAllPlayers
);

router.get(
  "/users/duplicates",
  authenticate,
  requireRole("super_admin"),
  adminController.getDuplicateUsers
);

router.post(
  "/users/merge-duplicates",
  authenticate,
  requireRole("super_admin"),
  validate(schemas.mergeDuplicateUsers),
  adminController.mergeDuplicateUsers
);

router.get(
  "/identity-changes/pending",
  authenticate,
  requireRole("super_admin"),
  adminController.getPendingIdentityChanges
);

router.post(
  "/identity-changes/:requestId/approve",
  authenticate,
  requireRole("super_admin"),
  adminController.approveIdentityChange
);

router.post(
  "/identity-changes/:requestId/reject",
  authenticate,
  requireRole("super_admin"),
  validate(schemas.rejectIdentityChange),
  adminController.rejectIdentityChange
);

// Standard Match Result Approval (Mobile App Alias)
router.put(
  "/:resultId/approve",
  authenticate,
  requireRole(["organization", "super_admin"]),
  matchResultController.approveMatchResult
);

// Walkover Approval/Rejection (Mobile App Alias)
router.put(
  "/:resultId/walkover",
  authenticate,
  requireRole(["organization", "super_admin"]),
  matchResultController.approveRejectWalkover
);

module.exports = router;
