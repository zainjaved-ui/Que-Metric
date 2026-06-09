// models/TournamentParticipant.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const TournamentParticipant = sequelize.define(
  "TournamentParticipant",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tournamentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Foreign key to Tournament",
    },
    playerId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Foreign key to Player",
    },
    registrationDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "When player registered",
    },
    // Registration Method
    registrationMethod: {
      type: DataTypes.ENUM("self", "admin", "invitation", "join_code", "open_request"),
      allowNull: false,
      comment: "How player was added to tournament",
    },
    // Approval Status
    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected", "withdrawn", "disqualified"),
      allowNull: false,
      defaultValue: "pending",
      comment: "Participation status",
    },
    approvedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When registration was approved",
    },
    approvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Admin who approved (if applicable)",
    },
    // Seeding Information
    seed: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Player's seed position (1-N, 1 is top seed)",
    },
    skillRating: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: "Player's skill level for divisional allocation",
    },
    // Group/Division Assignment
    groupId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Group ID if tournament uses groups",
    },
    divisionId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Division ID if tournament uses divisions",
    },
    // Ladder Format
    ladderPosition: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Current position in ladder (1 = top)",
    },
    lastChallengeDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When player last issued a ladder challenge",
    },
    // Withdrawal Information
    withdrawnDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When player withdrew",
    },
    withdrawalReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Reason for withdrawal",
    },
    withdrawalStage: {
      type: DataTypes.ENUM("before_start", "during_group", "during_knockout", "during_swiss"),
      allowNull: true,
      comment: "At which stage did withdrawal occur",
    },
    // Performance Tracking
    matchesPlayed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total matches played",
    },
    matchesWon: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total matches won",
    },
    matchesLost: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total matches lost",
    },
    matchesDraw: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total match draws",
    },
    framesWon: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total frames won",
    },
    framesLost: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total frames lost",
    },
    pointsEarned: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total tournament points",
    },
    // Detailed Performance Stats (Snooker)
    highestBreak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Highest break scored in tournament (snooker only)",
    },
    breaks50Plus: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total 50+ breaks (snooker only)",
    },
    breaks100Plus: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total 100+ breaks / centuries (snooker only)",
    },
    // Pool-Specific Stats
    sevenBallWins: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "7-ball wins (pool only)",
    },
    // All Sports - Detailed Stats
    ballsPotted: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total balls potted (pool/pooker)",
    },
    blackFinishes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Black ball finishes (pooker only)",
    },
    // Whitewash tracking (all sports)
    whitewashWins: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Matches won without opponent scoring (whitewash wins)",
    },
    whitewashLosses: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Matches lost without scoring (whitewash losses)",
    },
    frameDifference: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Difference between frames won and lost",
    },
    currentPosition: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Current standing/position in tournament",
    },
    // Ranking
    rankingPointsAwarded: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Ranking points earned (if tournament is ranked)",
    },
    finishingRound: {
      type: DataTypes.ENUM("group_stage", "knockout_round_16", "knockout_round_8", "knockout_round_4", "semi_final", "final", "winner", "withdrew"),
      allowNull: true,
      comment: "Which round player finished",
    },
    finishingPosition: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Numeric finishing position (1=winner, 2=runner-up, 3-4=semi, 5-8=quarter…); set by completeTournament",
    },
    // Late Registration Tracking
    registeredLate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "True if player was added during late registration phase",
    },
    registrationPhase: {
      type: DataTypes.STRING(50),
      defaultValue: "standard",
      comment: "Which registration phase player joined in: standard, late, qualifier, substitute, waitlist",
    },
    addedViaRegenerationRound: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Fixture regeneration round number if added during regeneration (1, 2, 3...)",
    },
  },
  {
    tableName: "tournament_participants",
    timestamps: true,
    indexes: [
      { fields: ["tournamentId"] },
      { fields: ["playerId"] },
      { fields: ["tournamentId", "playerId"] },
    ],
  }
);

module.exports = TournamentParticipant;
