// models/Notification.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Notification = sequelize.define(
  "Notification",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    recipientId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Player ID who needs to take action",
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Player ID who triggered the notification (NULL for system notifications)",
    },
    type: {
      type: DataTypes.ENUM(
        "match_result_confirmation",
        "dispute_resolved",
        "match_reminder",
        "league_update",
        "late_player_added",
        "bracket_regenerated",
        "qualifier_match_scheduled",
        "fixture_changes"
      ),
      allowNull: false,
    },
    relatedEntityType: {
      type: DataTypes.ENUM(
        "match_result",
        "disputed_match",
        "booking",
        "league",
        "tournament",
        "tournament_participant",
        "tournament_match"
      ),
      allowNull: false,
    },
    relatedEntityId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "ID of the related entity (e.g., match_result ID)",
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("unread", "read", "actioned"),
      allowNull: false,
      defaultValue: "unread",
    },
    actionStatus: {
      type: DataTypes.ENUM(
        "awaiting_confirmation",
        "confirmed",
        "disputed",
        "resolved",
        "dismissed"
      ),
      allowNull: true,
      defaultValue: "awaiting_confirmation",
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Additional data like match details, scores, etc.",
    },
  },
  {
    tableName: "notifications",
    timestamps: true,
    indexes: [
      {
        fields: ["recipientId"],
      },
      {
        fields: ["status"],
      },
      {
        fields: ["actionStatus"],
      },
      {
        fields: ["type"],
      },
      {
        fields: ["relatedEntityId"],
      },
    ],
  }
);

module.exports = Notification;
