const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const CompetitionTeam = sequelize.define(
  "CompetitionTeam",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    competitionId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "ID of the League or Tournament",
    },
    competitionType: {
      type: DataTypes.ENUM("league", "tournament"),
      allowNull: false,
      comment: "Type of competition",
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Optional team name (e.g., 'The Sharks' or auto-generated 'Scott / Dan W')",
    },
    player1Id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Reference to the first player in the team",
    },
    player2Id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Reference to the second player in the team",
    },
    seeding: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Team seeding for the competition",
    },
    handicap: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Team handicap for this specific competition",
    },
    status: {
      type: DataTypes.ENUM("active", "withdrawn", "eliminated"),
      defaultValue: "active",
    },
  },
  {
    tableName: "competition_teams",
    timestamps: true,
  }
);

module.exports = CompetitionTeam;
