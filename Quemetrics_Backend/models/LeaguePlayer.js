// models/LeaguePlayer.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const LeaguePlayer = sequelize.define(
  "LeaguePlayer",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    leagueId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Which league the player is enrolled in",
    },
    tournamentId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Which tournament the player is enrolled in",
    },
    playerId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Player ID",
    },
    divisionId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Division assignment (null for Poker/Tournament, required for Snooker/Pool Leagues)",
    },
    ranking: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Player's ranking at enrollment (CueMetrics Rank)",
    },
    // Poker-specific fields
    seatPosition: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "For Poker: Seat position at table",
    },
    tableNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "For Poker: Table assignment",
    },
    currentChips: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "For Poker: Current chip count",
    },
    isEliminated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "For Poker: Elimination status",
    },
    eliminationPosition: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "For Poker: Finish position",
    },
    // General stats
    matchesPlayed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    matchesWon: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    matchesLost: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    draws: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    framesWon: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    framesLost: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    frameDifference: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    whitewashes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    highestBreak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    points: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    walkoverWins: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Count of matches won via walkover"
    },
    walkoverLosses: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Count of matches lost via walkover"
    },
    participationPoints: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    bonusPoints: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    winPercentage: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    streak: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: "Current win/loss streak (e.g., W3, L1)",
    },
    // Game-specific granular stats (Summaries)
    breaks50Plus: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Snooker: Count of 50+ breaks",
    },
    breaks100Plus: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Snooker: Count of 100+ breaks",
    },
    ballsPotted: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Pool/Pooker: Total balls potted",
    },
    ballsConceded: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Pool: Total balls conceded to opponent",
    },
    sevenBallWins: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Pool: Count of 7-ball clearance wins",
    },
    blackFinishes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Pooker: Count of winning on the black ball",
    },
    whitewashWins: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Count of matches won without losing a frame/rack",
    },
    enrollmentDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    status: {
      type: DataTypes.ENUM("active", "late_enrollment", "withdrawn", "eliminated"),
      allowNull: false,
      defaultValue: "active",
    },
    approvalStatus: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "approved",
      comment: "Approval status for join requests (pending = waiting for admin approval, approved = approved, rejected = rejected)",
    },
    headToHeadResults: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Map of opponentId to points earned against them for tie-breaking",
    },
    manualPointsAdjustment: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Manual points adjustment by administrator",
    },
    adjustmentNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Reason for manual points adjustment",
    },
    manuallyAssigned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "True if this player was manually assigned to a division by an admin; protects against auto-reassignment when manualOverride is on",
    },
    rating: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: "Player's rating for auto handicap calculation (league-specific)",
    },
    handicap: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Player's handicap for this league (can be set/fixed/updated)",
    },
    swissTieBreakScore: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      comment: "Calculated Swiss tie-break score (Buchholz, Median, or Sonneborn-Berger)",
    },
    partialParticipation: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "partial_participation",
      comment: "True when player joined after full schedule was generated (late joiner in full_schedule league); they may not play all fixtures.",
    },
    excludeFromRankings: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "exclude_from_rankings",
      comment: "If true, player's stats are tracked but they are excluded from official league standings/rankings. Useful for partial-participation late joiners.",
    },
    title: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Achievement title earned in the league (e.g., 'Champion', 'Runner-up')",
    },

  },
  {
    tableName: "league_players",
    timestamps: true,
    indexes: [
      { fields: ["leagueId"] },
      { fields: ["playerId"] },
      { fields: ["divisionId"] },
    ],
    hooks: {
    // ...existing code...
      async afterCreate(leaguePlayer, options) {
        if (leaguePlayer.leagueId) {
          const { League } = require("../models");
          const count = await LeaguePlayer.count({ where: { leagueId: leaguePlayer.leagueId } });
          await League.update({ totalPlayers: count }, { where: { id: leaguePlayer.leagueId } });
        }
      },
      async afterDestroy(leaguePlayer, options) {
        if (leaguePlayer.leagueId) {
          const { League } = require("../models");
          const count = await LeaguePlayer.count({ where: { leagueId: leaguePlayer.leagueId } });
          await League.update({ totalPlayers: count }, { where: { id: leaguePlayer.leagueId } });
        }
      },
      async afterUpdate(leaguePlayer, options) {
        if (leaguePlayer.changed("leagueId")) {
          const { League } = require("../models");
          if (leaguePlayer.leagueId) {
            const count = await LeaguePlayer.count({ where: { leagueId: leaguePlayer.leagueId } });
            await League.update({ totalPlayers: count }, { where: { id: leaguePlayer.leagueId } });
          }
          const previousLeagueId = leaguePlayer.previous("leagueId");
          if (previousLeagueId) {
            const prevCount = await LeaguePlayer.count({ where: { leagueId: previousLeagueId } });
            await League.update({ totalPlayers: prevCount }, { where: { id: previousLeagueId } });
          }
        }
      }
    }
  }
);

module.exports = LeaguePlayer;
