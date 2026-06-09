// models/PokerTournamentStructure.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const PokerTournamentStructure = sequelize.define(
  "PokerTournamentStructure",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    leagueId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      comment: "One structure per Poker league",
    },
    tournamentType: {
      type: DataTypes.ENUM("freezeout", "rebuy", "knockout"),
      allowNull: false,
      comment: "Type of poker tournament",
    },
    startingChips: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10000,
      comment: "Starting chip count for each player",
    },
    blindLevels: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: "Array of blind levels [{level: 1, smallBlind: 25, bigBlind: 50, duration: 15}]",
    },
    blindDuration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 15,
      comment: "Duration in minutes for each blind level",
    },
    maxPlayersPerTable: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 9,
      comment: "Maximum players per table (usually 8-10)",
    },
    buyInAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Buy-in amount (optional)",
    },
    rebuyAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Allow rebuys during specified period",
    },
    rebuyPeriod: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Number of blind levels during which rebuys are allowed",
    },
    prizeStructure: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Prize distribution [{position: 1, percentage: 40}, ...]",
    },
  },
  {
    tableName: "poker_tournament_structures",
    timestamps: true,
  }
);

module.exports = PokerTournamentStructure;
