// routes/notification.js
const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { authenticate } = require("../middleware/auth");

/**
 * Notification Routes
 * All routes require authentication
 */

// Get unread notifications
router.get("/unread", authenticate, notificationController.getUnreadNotifications);

// Get notification summary
router.get("/summary", authenticate, notificationController.getNotificationSummary);

// Get unread count
router.get("/unread-count", authenticate, notificationController.getUnreadCount);

// Get all notifications with pagination
router.get("/", authenticate, notificationController.getAllNotifications);

// Get notifications by type
router.get("/type/:type", authenticate, notificationController.getNotificationsByType);

// Get tournament-specific notifications
router.get(
  "/tournament/:tournamentId",
  authenticate,
  notificationController.getTournamentNotifications
);

// Mark single notification as read
router.patch("/:notificationId/read", authenticate, notificationController.markAsRead);

// Mark all notifications as read
router.post("/read-all", authenticate, notificationController.markAllAsRead);

// Delete notification
router.delete("/:notificationId", authenticate, notificationController.deleteNotification);

// Cleanup old notifications (admin only)
router.post("/cleanup", authenticate, notificationController.cleanupOldNotifications);

module.exports = router;
