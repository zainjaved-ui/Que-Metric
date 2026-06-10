const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { validate, schemas } = require("../middleware/validate");

router.post("/register/player", validate(schemas.registerPlayer), authController.registerPlayer);
router.post("/register/organization", validate(schemas.registerOrganization), authController.registerOrganization);
router.get("/verify-email", authController.verifyEmail);
router.post("/resend-verification", validate(schemas.resendVerification), authController.resendVerification);
router.post("/login", validate(schemas.login), authController.login);
router.post("/confirm-role-selection", authController.confirmRoleSelection);  // ✅ NEW: No auth needed, no validation schema (simple payload)
router.post("/switch-role", authenticate, authController.switchRole);
router.post("/refresh-token", validate(schemas.refreshToken), authController.refreshToken);
router.post("/logout", authenticate, authController.logout);
router.post("/forgot-password", validate(schemas.forgotPassword), authController.forgotPassword);
router.post("/reset-password", validate(schemas.resetPassword), authController.resetPassword);

// Settings endpoints (all roles)
router.put("/change-password", authenticate, validate(schemas.changePassword), authController.changePassword);
router.get("/notification-preferences", authenticate, authController.getNotificationPreferences);
router.put("/notification-preferences", authenticate, validate(schemas.updateNotificationPreferences), authController.updateNotificationPreferences);
router.delete("/delete-account", authenticate, validate(schemas.deleteAccount), authController.deleteAccount);

module.exports = router;
