// models/Division.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Division = sequelize.define(
  "Division",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    leagueId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Which league this division belongs to",
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "Division name (e.g., 'Division A', 'Premier Division')",
    },
    // Snooker-specific fields
    numberOfFrames: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "For Snooker: Best of X frames (e.g., 5, 7, 9)",
    },
    // Pool-specific fields
    raceLength: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "For Pool: Race to X (e.g., 5, 7)",
    },
    maxPlayers: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Maximum players in this division",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("active", "completed", "cancelled"),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    tableName: "divisions",
    timestamps: true,
    indexes: [
      { fields: ["leagueId"] },
      { fields: ["name"] },
    ],
  }
);

module.exports = Division;
