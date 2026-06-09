const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ClubVenue = sequelize.define(
  "ClubVenue",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    clubId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Club (organizational entity)",
    },
    venueOwnerId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Venue (physical location)",
    },
    venueRef: {
      type: DataTypes.STRING(191),
      allowNull: true,
      comment: "Stable token for embedded venues (e.g., venue_xxx)",
    },
    venueName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Display name for embedded club venues",
    },
    tables: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: "Embedded table definitions for club-managed venues",
    },
    slots: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: "Embedded availability slots for club-managed venues",
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      comment: "Additional serialized venue data for backward compatibility",
    },
    sourceType: {
      type: DataTypes.ENUM("linked_owner", "embedded_club"),
      allowNull: false,
      defaultValue: "embedded_club",
      comment: "Source of club venue row",
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Primary venue for the club",
    },
    linkedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "User ID of admin who linked this venue",
    },
    linkedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "When the venue was linked",
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active",
      comment: "Active: currently linked | Inactive: historical link",
    },
  },
  {
    tableName: "club_venues",
    timestamps: true,
    indexes: [
      { fields: ["clubId"] },
      { fields: ["venueOwnerId"] },
      { fields: ["venueRef"] },
      { fields: ["status"] },
      // Prevent duplicate links
      { fields: ["clubId", "venueOwnerId"], unique: true },
    ],
  }
);

module.exports = ClubVenue;
