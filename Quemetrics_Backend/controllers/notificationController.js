// controllers/notificationController.js
const { Notification, Player } = require("../models");
const NotificationService = require("../services/NotificationService");

/**
 * NotificationController
 * Handle notification-related API endpoints
 */

// Get unread notifications for current user
exports.getUnreadNotifications = async (req, res) => {
  try {
    const { playerId } = req.user; // Assuming auth middleware sets this
    const limit = parseInt(req.query.limit) || 20;

    const notifications = await NotificationService.getUnreadNotifications(
      playerId,
      limit
    );

    res.json({
      success: true,
      data: notifications,
      count: notifications.length,
    });
  } catch (error) {
    console.error("Error fetching unread notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message,
    });
  }
};

// Get notification summary
exports.getNotificationSummary = async (req, res) => {
  try {
    const { playerId } = req.user;

    const summary = await NotificationService.getNotificationSummary(playerId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching notification summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notification summary",
      error: error.message,
    });
  }
};

// Get all notifications (with pagination)
exports.getAllNotifications = async (req, res) => {
  try {
    const { playerId } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status; // 'read', 'unread', or undefined for all

    const where = { recipientId: playerId };
    if (status) {
      where.status = status;
    }

    const { count, rows } = await Notification.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      include: [
        {
          association: "sender",
          attributes: ["id", "displayName"],
          required: false,
        },
      ],
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching all notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message,
    });
  }
};

// Mark single notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { playerId } = req.user;

    // Verify ownership
    const notification = await Notification.findByPk(notificationId);
    if (!notification || notification.recipientId !== playerId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this notification",
      });
    }

    await NotificationService.markAsRead(notificationId);

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
      error: error.message,
    });
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const { playerId } = req.user;

    await NotificationService.markAllAsRead(playerId);

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notifications as read",
      error: error.message,
    });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { playerId } = req.user;

    // Verify ownership
    const notification = await Notification.findByPk(notificationId);
    if (!notification || notification.recipientId !== playerId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this notification",
      });
    }

    await notification.destroy();

    res.json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
      error: error.message,
    });
  }
};

// Get notifications by type
exports.getNotificationsByType = async (req, res) => {
  try {
    const { playerId } = req.user;
    const { type } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    // Validate type
    const validTypes = [
      "match_result_confirmation",
      "dispute_resolved",
      "match_reminder",
      "league_update",
      "late_player_added",
      "bracket_regenerated",
      "qualifier_match_scheduled",
      "fixture_changes",
    ];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification type",
      });
    }

    const notifications = await Notification.findAll({
      where: {
        recipientId: playerId,
        type,
      },
      order: [["createdAt", "DESC"]],
      limit,
    });

    res.json({
      success: true,
      data: notifications,
      count: notifications.length,
      type,
    });
  } catch (error) {
    console.error("Error fetching notifications by type:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message,
    });
  }
};

// Get tournament-related notifications
exports.getTournamentNotifications = async (req, res) => {
  try {
    const { playerId } = req.user;
    const { tournamentId } = req.params;

    const notifications = await Notification.findAll({
      where: {
        recipientId: playerId,
        relatedEntityType: "tournament",
        relatedEntityId: tournamentId,
      },
      order: [["createdAt", "DESC"]],
      include: [
        {
          association: "sender",
          attributes: ["id", "displayName"],
          required: false,
        },
      ],
    });

    res.json({
      success: true,
      data: notifications,
      count: notifications.length,
      tournamentId,
    });
  } catch (error) {
    console.error("Error fetching tournament notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tournament notifications",
      error: error.message,
    });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const { playerId } = req.user;

    const unreadCount = await Notification.count({
      where: {
        recipientId: playerId,
        status: "unread",
      },
    });

    res.json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Error getting unread count:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get unread count",
      error: error.message,
    });
  }
};

// Cleanup old notifications (admin only)
exports.cleanupOldNotifications = async (req, res) => {
  try {
    // Check if user is admin (you may need to adjust this based on your auth system)
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can cleanup notifications",
      });
    }

    const { daysOld = 30 } = req.body;

    const deletedCount = await NotificationService.deleteOldNotifications(
      daysOld
    );

    res.json({
      success: true,
      message: `Deleted ${deletedCount} old notifications`,
      deletedCount,
    });
  } catch (error) {
    console.error("Error cleaning up old notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup notifications",
      error: error.message,
    });
  }
};
