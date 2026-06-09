const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const SeasonRankingSnapshot = sequelize.define(
  "SeasonRankingSnapshot",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    snapshotBatchId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Groups all rows created by one snapshot calculation run",
    },
    seasonId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Season for which ranking snapshot is calculated",
    },
    sport: {
      type: DataTypes.ENUM("snooker", "pool", "pooker"),
      allowNull: false,
      comment: "Independent ranking stream by sport",
    },
    playerId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Player included in this ranking snapshot",
    },
    totalPoints: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tournamentsCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Optional tie-break/supporting metadata",
    },
  },
  {
    tableName: "season_ranking_snapshots",
    timestamps: true,
    indexes: [
      { fields: ["seasonId", "sport"] },
      { fields: ["snapshotBatchId"] },
      { fields: ["playerId"] },
      { unique: true, fields: ["snapshotBatchId", "playerId"] },
    ],
  }
);

module.exports = SeasonRankingSnapshot;
