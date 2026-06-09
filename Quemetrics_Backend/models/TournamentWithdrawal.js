// models/TournamentWithdrawal.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const TournamentWithdrawal = sequelize.define(
  "TournamentWithdrawal",
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
    stage: {
      type: DataTypes.ENUM("before_start", "during_group", "during_knockout", "during_swiss"),
      allowNull: false,
      comment: "Tournament stage at which the withdrawal occurred",
    },
    ruleApplied: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: "The withdrawal rule that was applied: remove, forfeit, remove_all, 50_percent_rule, walkover, void",
    },
    action: {
      type: DataTypes.STRING(80),
      allowNull: true,
      comment: "The specific action taken, e.g. voided_group_results, walkover_group_partial",
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Player-provided reason for withdrawal",
    },
    voidedMatches: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of matches voided as a result of withdrawal",
    },
    forfeitedMatches: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of matches forfeited as a result of withdrawal",
    },
    processedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "userId of the actor who triggered the withdrawal (player or admin)",
    },
    withdrawnAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "When the withdrawal was processed",
    },
  },
  {
    tableName: "tournament_withdrawals",
    timestamps: true,
    indexes: [
      { fields: ["tournamentId"] },
      { fields: ["playerId"] },
      { fields: ["tournamentId", "playerId"] },
    ],
  }
);

module.exports = TournamentWithdrawal;
