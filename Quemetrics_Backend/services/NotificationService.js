// services/NotificationService.js
const { Notification, Player, Tournament, TournamentParticipant } = require("../models");

/**
 * NotificationService
 * Handles creation and delivery of notifications for tournament events
 * Currently creates in-database notifications (for email, SMS, real-time via WebSocket)
 */
class NotificationService {
  /**
   * Send notification to a single recipient
   * @param {Object} params - { recipientId, type, title, message, relatedEntityType, relatedEntityId, senderId, metadata }
   */
  static async sendNotification(params) {
    try {
      const {
        recipientId,
        type,
        title,
        message,
        relatedEntityType,
        relatedEntityId,
        senderId = null,
        metadata = {},
      } = params;

      const notification = await Notification.create({
        recipientId,
        senderId,
        type,
        relatedEntityType,
        relatedEntityId,
        title,
        message,
        metadata,
        status: "unread",
        actionStatus: "awaiting_confirmation",
      });

      console.log(`✓ Notification sent to ${recipientId}: ${type}`);
      return notification;
    } catch (error) {
      console.error("Error sending notification:", error);
      throw error;
    }
  }

  /**
   * Notify all tournament participants about fixture changes
   * @param {Object} params - { tournamentId, type, title, message, relatedEntityId, userId, excludePlayerIds }
   */
  static async notifyTournamentParticipants(params) {
    try {
      const {
        tournamentId,
        type,
        title,
        message,
        relatedEntityId,
        userId,
        excludePlayerIds = [],
      } = params;

      // Get all approved participants
      const participants = await TournamentParticipant.findAll({
        where: {
          tournamentId,
          status: "approved",
        },
        include: {
          association: "player",
          attributes: ["id"],
        },
      });

      const playerIds = participants
        .map((p) => p.playerId)
        .filter((id) => !excludePlayerIds.includes(id)); // Exclude late player themselves if desired

      if (playerIds.length === 0) {
        console.log("No participants to notify");
        return [];
      }

      // Create notification for each participant
      const notifications = await Promise.all(
        playerIds.map((playerId) =>
          this.sendNotification({
            recipientId: playerId,
            senderId: userId,
            type,
            title,
            message,
            relatedEntityType: "tournament",
            relatedEntityId: tournamentId,
            metadata: { playerCount: playerIds.length },
          })
        )
      );

      console.log(`✓ Notified ${notifications.length} participants`);
      return notifications;
    } catch (error) {
      console.error("Error notifying tournament participants:", error);
      throw error;
    }
  }

  /**
   * Notify about late player addition
   */
  static async notifyLatePlayerAdded(params) {
    try {
      const {
        tournamentId,
        newPlayerName,
        strategy,
        userId,
        newPlayerId,
        affectedPlayerCount,
      } = params;

      const tournament = await Tournament.findByPk(tournamentId);
      if (!tournament) throw new Error("Tournament not found");

      const strategyLabel = {
        regenerate: "Bracket Regenerated",
        qualifier: "Qualifier Match",
        waitlist: "Waitlist Updated",
        fill_bye: "BYE Slot Filled",
      }[strategy] || strategy;

      // Notify affected participants
      await this.notifyTournamentParticipants({
        tournamentId,
        type: "late_player_added",
        title: `⚡ ${strategyLabel}: ${newPlayerName} Added`,
        message:
          strategy === "regenerate"
            ? `The tournament bracket has been regenerated with new late entry ${newPlayerName}. All fixtures have been reset. Check your new matches.`
            : strategy === "qualifier"
            ? `${newPlayerName} has been added to the tournament via a qualifier round. The main bracket remains unchanged.`
            : strategy === "waitlist"
            ? `${newPlayerName} has been added to the tournament waitlist. You will be notified if they join your bracket.`
            : `${newPlayerName} has filled a BYE slot in the tournament.`,
        relatedEntityId: tournamentId,
        userId,
        excludePlayerIds: [newPlayerId],
      });

      return {
        success: true,
        notificationsSent: affectedPlayerCount,
      };
    } catch (error) {
      console.error("Error notifying about late player addition:", error);
      throw error;
    }
  }

  /**
   * Notify about bracket regeneration
   */
  static async notifyBracketRegenerated(params) {
    try {
      const {
        tournamentId,
        oldMatchCount,
        newMatchCount,
        affectedPlayerCount,
        userId,
        reseedStrategy,
      } = params;

      const tournament = await Tournament.findByPk(tournamentId);
      if (!tournament) throw new Error("Tournament not found");

      // Notify all affected participants
      await this.notifyTournamentParticipants({
        tournamentId,
        type: "bracket_regenerated",
        title: "🔄 Tournament Bracket Regenerated",
        message: `The tournament bracket has been regenerated. ${oldMatchCount} fixtures were replaced with ${newMatchCount} new fixtures. Your seeding has been updated using ${reseedStrategy} strategy. Check your updated schedule.`,
        relatedEntityId: tournamentId,
        userId,
      });

      return {
        success: true,
        notificationsSent: affectedPlayerCount,
      };
    } catch (error) {
      console.error("Error notifying about bracket regeneration:", error);
      throw error;
    }
  }

  /**
   * Notify about qualifier match scheduled
   */
  static async notifyQualifierMatchScheduled(params) {
    try {
      const {
        tournamentId,
        newPlayerName,
        matchId,
        userId,
        qualifierPlayerId,
        existingPlayerName,
      } = params;

      // Notify the new player
      await this.sendNotification({
        recipientId: qualifierPlayerId,
        senderId: userId,
        type: "qualifier_match_scheduled",
        title: `🎯 Qualifier Match Scheduled: ${existingPlayerName}`,
        message: `Your qualifier match has been scheduled against ${existingPlayerName}. Win to join the tournament in Round 1.`,
        relatedEntityType: "tournament_match",
        relatedEntityId: matchId,
        metadata: {
          matchId,
          tournamentId,
          opponent: existingPlayerName,
        },
      });

      return {
        success: true,
        notificationSent: true,
      };
    } catch (error) {
      console.error("Error notifying about qualifier match:", error);
      throw error;
    }
  }

  /**
   * Get unread notifications for a player
   */
  static async getUnreadNotifications(playerId, limit = 20) {
    try {
      const notifications = await Notification.findAll({
        where: {
          recipientId: playerId,
          status: "unread",
        },
        order: [["createdAt", "DESC"]],
        limit,
        include: [
          {
            association: "sender",
            attributes: ["id", "displayName"],
          },
        ],
      });

      return notifications;
    } catch (error) {
      console.error("Error fetching unread notifications:", error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId) {
    try {
      const notification = await Notification.findByPk(notificationId);
      if (!notification) throw new Error("Notification not found");

      await notification.update({
        status: "read",
      });

      return notification;
    } catch (error) {
      console.error("Error marking notification as read:", error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a player
   */
  static async markAllAsRead(playerId) {
    try {
      await Notification.update(
        { status: "read" },
        {
          where: {
            recipientId: playerId,
            status: "unread",
          },
        }
      );

      return { success: true };
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      throw error;
    }
  }

  /**
   * Get notification summary for dashboard
   */
  static async getNotificationSummary(playerId) {
    try {
      const unreadCount = await Notification.count({
        where: {
          recipientId: playerId,
          status: "unread",
        },
      });

      const recentNotifications = await Notification.findAll({
        where: {
          recipientId: playerId,
        },
        order: [["createdAt", "DESC"]],
        limit: 5,
        attributes: ["id", "type", "title", "status", "createdAt"],
      });

      return {
        unreadCount,
        recent: recentNotifications,
      };
    } catch (error) {
      console.error("Error getting notification summary:", error);
      throw error;
    }
  }

  /**
   * Delete old notifications (cleanup)
   */
  static async deleteOldNotifications(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await Notification.destroy({
        where: {
          createdAt: {
            [require("sequelize").Op.lt]: cutoffDate,
          },
          status: "read", // Only delete read notifications
        },
      });

      console.log(`✓ Deleted ${result} old notifications`);
      return result;
    } catch (error) {
      console.error("Error deleting old notifications:", error);
      throw error;
    }
  }
}

module.exports = NotificationService;
