// models/Season.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Season = sequelize.define(
  "Season",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Which organization created this season",
    },
    gameId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Which game this season is for (Snooker, Pool, or Pooker)",
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("upcoming", "active", "completed"),
      allowNull: false,
      defaultValue: "upcoming",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "seasons",
    timestamps: true,
  }
);

module.exports = Season;
