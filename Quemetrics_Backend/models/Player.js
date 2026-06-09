// models/Player.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Player = sequelize.define(
  "Player",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Player's home club/organization (optional)",
    },
    clubId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Player's specific club within an organization (optional)",
    },
    county: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "NEW: Player's county for scope-based ranking queries",
    },
    region: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "NEW: Player's region for scope-based ranking queries",
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Link to User record with role=player",
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    nickname: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    avatarUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: "Date of birth - cannot be changed after initial set",
    },
    gender: {
      type: DataTypes.ENUM("male", "female", "other", "prefer_not_to_say"),
      allowNull: true,
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    mobileNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: "Mobile number for important notifications",
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Full address of the player",
    },
    experienceLevel: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Player's self-reported experience level (free text)",
    },
    badgeType: {
      type: DataTypes.ENUM("Casual", "Verified"),
      defaultValue: "Casual",
      comment: "Casual = self-entered stats, Verified = official league stats",
    },
    sports: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Array: ["snooker", "pool", "pooker"] - Set by user after registration',
    },
    disabilityFlag: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isIndependent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "For future: players who don't belong to any club",
    },
  },
  {
    tableName: "players",
    timestamps: true,
  }
);

module.exports = Player;