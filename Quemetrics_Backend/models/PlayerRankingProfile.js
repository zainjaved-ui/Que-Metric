// models/PlayerRankingProfile.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Unified global ranking profile for each player
const PlayerRankingProfile = sequelize.define(
  "PlayerRankingProfile",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    playerId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      comment: "Player this profile belongs to",
    },
    // Overall Statistics (all tournaments, all time)
    totalTournamentsPlayed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalTournamentWins: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalFramesWon: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalFramesLost: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalWhitewashes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    highestBreak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    // Ranking Tiers
    tier1Points: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: "Tier 1 (Major) ranking points",
    },
    tier2Points: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: "Tier 2 (Club Championship) ranking points",
    },
    tier3Points: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: "Tier 3 (Local) ranking points",
    },
    // Rolling 12-Month Points (decaying)
    rolling12MonthPoints: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: "Total points in rolling 12-month window",
    },
    // Current Tiers Ranking
    tier1Ranking: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Current rank in Tier 1",
    },
    tier2Ranking: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Current rank in Tier 2",
    },
    tier3Ranking: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Current rank in Tier 3",
    },
    // Scope Rankings (county, regional, national)
    countyRanking: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    countyRankingPoints: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    regionalRanking: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    regionalRankingPoints: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    nationalRanking: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    nationalRankingPoints: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    // Last Updated
    lastRankingUpdate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "When rankings were last recalculated",
    },
    // Anti-Farming Metrics
    participationCount12Months: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of tournaments entered in 12 months",
    },
    minParticipationMet: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Has player met minimum participation threshold",
    },
  },
  {
    tableName: "player_ranking_profiles",
    timestamps: true,
    indexes: [
      { fields: ["playerId"] },
      { fields: ["tier1Ranking"] },
      { fields: ["tier2Ranking"] },
      { fields: ["tier3Ranking"] },
    ],
  }
);

module.exports = PlayerRankingProfile;
